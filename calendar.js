let SEARCH = null;
let AVAIL = null;

async function loadSearchIndex() {
  const resp = await fetch("data/search_index.json");
  SEARCH = await resp.json();
}

async function loadAvailability() {
  const resp = await fetch("data/availability.json");
  AVAIL = await resp.json();
}

console.log("calendar.js LOADED");

// ---- DATE HELPERS ----
function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHumanDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// ---- TIME HELPERS ----
function to12h(t) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12 + 1);
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ---- SUBTRACT HALF-FIELD USAGE FROM FULL-FIELD WINDOWS ----
function subtractUsage(fullWindows, halfUsage) {
  const result = [];

  fullWindows.forEach(win => {
    let segments = [{ start: win.start, end: win.end }];

    halfUsage.forEach(use => {
      const newSegments = [];

      segments.forEach(seg => {
        if (use.end <= seg.start || use.start >= seg.end) {
          newSegments.push(seg);
        } else {
          if (use.start > seg.start) {
            newSegments.push({ start: seg.start, end: use.start });
          }
          if (use.end < seg.end) {
            newSegments.push({ start: use.end, end: seg.end });
          }
        }
      });

      segments = newSegments;
    });

    result.push(...segments);
  });

  return result;
}

// ---- MERGE SAME-TIME BLOCKS ----
function mergeSameTimeBlocks(blocks) {
  const merged = [];

  blocks.forEach(block => {
    const existing = merged.find(b =>
      b.start === block.start &&
      b.end === block.end &&
      b.type === block.type
    );

    if (existing) {
      existing.titles = existing.titles || [];
      if (block.title) existing.titles.push(block.title);
    } else {
      merged.push({
        ...block,
        titles: block.title ? [block.title] : []
      });
    }
  });

  return merged;
}

// ---- BUILD BLOCKS FOR A FIELD (FREE + EVENTS, MERGED + SORTED) ----
function buildFieldBlocks(fieldId, dayData, FIELD_MAP) {
  const type = FIELD_MAP[fieldId].type;
  let blocks = [];

  if (type === "full") {
    const fullAvail = dayData.availability[fieldId] || [];

    const halfFields = dayData.fields.filter(f =>
      f.name === fieldId && f.complex === "half"
    );

    const halfUsage = [];
    halfFields.forEach(h => {
      const events = dayData.events[h.id] || [];
      events.forEach(ev => {
        halfUsage.push({ start: ev.start, end: ev.end });
      });
    });

    const trueAvail = subtractUsage(fullAvail, halfUsage);

    blocks = trueAvail.map(win => ({
      field: fieldId,
      type: "free",
      start: win.start,
      end: win.end,
      start_12: to12h(win.start),
      end_12: to12h(win.end),
      title: null
    }));
  }

  if (type === "half") {
    const rawBlocks = (dayData.merged || []).filter(b => b.field === fieldId);

    blocks = rawBlocks.map(b => ({
      field: fieldId,
      type: b.type,
      start: b.start,
      end: b.end,
      start_12: b.start_12,
      end_12: b.end_12,
      title: b.title || null
    }));
  }

  blocks = mergeSameTimeBlocks(blocks);
  blocks.sort((a, b) => a.start.localeCompare(b.start));

  return blocks;
}

// ---- BUILD STITCHED COMPLEX ROWS (TIME-SLICED, ALL FIELDS TOGETHER) ----
function buildComplexRows(complexFields, dayData, FIELD_MAP) {
  const rowsByKey = {};

  complexFields.forEach(field => {
    const fid = field.id;
    const blocks = buildFieldBlocks(fid, dayData, FIELD_MAP);

    blocks.forEach(block => {
      const key = `${block.start}-${block.end}`;
      if (!rowsByKey[key]) {
        rowsByKey[key] = {
          start: block.start,
          end: block.end,
          items: []
        };
      }

      rowsByKey[key].items.push({
        fieldId: fid,
        fieldLabel: `${FIELD_MAP[fid].surface}`,
        type: block.type,
        title: block.title,
        start_12: block.start_12,
        end_12: block.end_12
      });
    });
  });

  const rows = Object.values(rowsByKey);
  rows.sort((a, b) => a.start.localeCompare(b.start));
  return rows;
}

// ---- GLOBAL STATE ----
let currentDate = new Date();

// ---- TIMELINE RENDER ----
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  const dateKey = formatDateKey(currentDate);

  tl.innerHTML = `
    <div class="timeline-times"></div>
    <div class="timeline-complexes"></div>
  `;

  const timeCol = tl.querySelector(".timeline-times");
  const complexCol = tl.querySelector(".timeline-complexes");

  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    complexCol.innerHTML = `<p>No availability for this date.</p>`;
    return;
  }

  const dayData = AVAIL.days[dateKey];
  const fields = dayData.fields;

  // ---- Build FIELD_MAP ----
  const FIELD_MAP = {};
  fields.forEach(f => {
    FIELD_MAP[f.id] = {
      id: f.id,
      parent: f.name,
      type: f.complex,      // "full" or "half"
      surface: f.surface,
      location: f.location || "Unknown"
    };
  });

  // ---- Time ruler (8 AM → 9 PM) ----
  const START_HOUR = 8;
  const END_HOUR = 21;
  const PIXELS_PER_MIN = 1;

  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const label = document.createElement("div");
    label.style.position = "absolute";
    label.style.top = `${top}px`;
    label.textContent = to12h(`${String(h).padStart(2, "0")}:00`);
    timeCol.appendChild(label);
  }

  // ---- Group fields by complex (using location) ----
  const complexes = {};
  fields.forEach(f => {
    const loc = f.location || "Unknown";
    if (!complexes[loc]) complexes[loc] = [];
    complexes[loc].push(f);
  });

  // ---- Render each complex as a single stitched timeline ----
  Object.keys(complexes).forEach(loc => {
    const complexContainer = document.createElement("div");
    complexContainer.className = "complex-column";

    const complexHeader = document.createElement("h3");
    complexHeader.textContent = loc;
    complexContainer.appendChild(complexHeader);

    const complexRow = document.createElement("div");
    complexRow.className = "complex-row";
    complexRow.style.position = "relative";
    complexRow.style.height = `${(END_HOUR - START_HOUR) * 60 * PIXELS_PER_MIN}px`;
    complexContainer.appendChild(complexRow);

    const rows = buildComplexRows(complexes[loc], dayData, FIELD_MAP);

    rows.forEach(rowData => {
      const blockDiv = document.createElement("div");
      blockDiv.className = "timeline-block";

      const startMin = timeToMinutes(rowData.start) - START_HOUR * 60;
      const endMin = timeToMinutes(rowData.end) - START_HOUR * 60;

      blockDiv.style.position = "absolute";
      blockDiv.style.left = "0px";
      blockDiv.style.right = "0px";
      blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
      blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;

      const freeItems = rowData.items.filter(i => i.type === "free");
      const reservedItems = rowData.items.filter(i => i.type !== "free");

      let html = "";

      if (freeItems.length > 0) {
        const freeFields = freeItems.map(i => i.fieldLabel).join(", ");
        html += `<strong>Available:</strong> ${freeFields}<br>`;
      }

      reservedItems.forEach(item => {
        const label = item.title ? item.title : item.type.toUpperCase();
        html += `${item.start_12} – ${item.end_12} ${label} — ${item.fieldLabel}<br>`;
      });

      // If only free, still show time + fields
      if (reservedItems.length === 0 && freeItems.length > 0) {
        const timeLabel = `${to12h(rowData.start)} – ${to12h(rowData.end)}`;
        const freeFields = freeItems.map(i => i.fieldLabel).join(", ");
        html = `${timeLabel} ${freeFields}`;
      }

      // Color: if any reserved, use reserved color; else free color
      const hasReserved = reservedItems.length > 0;
      blockDiv.style.background = hasReserved ? "#ffe5b4" : "#d0e8ff";
      blockDiv.style.border = "1px solid #999";
      blockDiv.style.borderRadius = "6px";
      blockDiv.style.fontSize = "12px";
      blockDiv.style.padding = "4px 8px";

      blockDiv.innerHTML = html;

      complexRow.appendChild(blockDiv);
    });

    complexCol.appendChild(complexContainer);
  });
}

// ---- INIT ----
document.addEventListener("DOMContentLoaded", async () => {
  await loadAvailability();
  await loadSearchIndex();
  render();
});

// ---- MAIN RENDER ----
function render() {
  const container = document.getElementById("view-container");

  const dateKey = formatDateKey(currentDate);
  const humanDate = formatHumanDate(dateKey);

  container.innerHTML = `
    <h2>Day View</h2>
    <div class="controls">
      <button id="prevDay">←</button>
      <span class="day-date">${humanDate}</span>
      <button id="nextDay">→</button>
    </div>
    <div id="dayTimeline"></div>
  `;

  document.getElementById("prevDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    render();
  };

  document.getElementById("nextDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    render();
  };

  renderTimeline();
}
