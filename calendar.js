let SEARCH = null;
let AVAIL = null;

async function loadSearchIndex() {
  const resp = await fetch("data/search_index.json");
  SEARCH = await resp.json();
  console.warn("SEARCH:", SEARCH);
}

async function loadAvailability() {
  const resp = await fetch("data/availability.json");
  AVAIL = await resp.json();
  console.warn("AVAIL:", AVAIL);
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

// ---- TIME CONVERSION ----
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

// ---- BUILD BLOCKS FOR A FIELD ----
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
    blocks = (dayData.merged[fieldId] || []).map(b => ({
      ...b,
      field: fieldId
    }));
  }

  blocks = mergeSameTimeBlocks(blocks);
  blocks.sort((a, b) => a.start.localeCompare(b.start));

  return blocks;
}

// ---- GLOBAL STATE ----
let currentDate = new Date();

// ---- TIMELINE RENDER ----
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  const dateKey = formatDateKey(currentDate);

  tl.innerHTML = `
    <p>Timeline for ${formatHumanDate(dateKey)}</p>
    <div class="timeline-times"></div>
    <div class="timeline-fields"></div>
  `;

  const timeCol = tl.querySelector(".timeline-times");
  const fieldCol = tl.querySelector(".timeline-fields");

  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    fieldCol.innerHTML = `<p>No availability for this date.</p>`;
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
      type: f.complex,
      surface: f.surface,
      location: f.location || null
    };
  });

  // ---- Time ruler (8 AM → 9 PM) ----
  const START_HOUR = 8;
  const END_HOUR = 21;
  const PIXELS_PER_MIN = 1;

  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const label = document.createElement("div");
    label.style.top = `${top}px`;
    label.textContent = to12h(`${String(h).padStart(2, "0")}:00`);
    timeCol.appendChild(label);
  }

  // ---- Render each field row ----
  fields.forEach(field => {
    const fid = field.id;
    const type = FIELD_MAP[fid].type;

    const row = document.createElement("div");
    row.className = "field-row";

    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = `${field.surface} (${type})`;
    row.appendChild(label);

    const blocks = buildFieldBlocks(fid, dayData, FIELD_MAP);

    blocks.forEach(block => {
      const div = document.createElement("div");
      div.className = "timeline-block";

      const color =
        block.type === "free" ? "#d0e8ff" :
        block.type === "practice" ? "#ffe5b4" :
        "#f0f0f0";

      div.style.background = color;

      const startMin = timeToMinutes(block.start) - START_HOUR * 60;
      const endMin = timeToMinutes(block.end) - START_HOUR * 60;

      div.style.top = `${startMin}px`;
      div.style.height = `${endMin - startMin}px`;

      div.innerHTML = `
        <strong>${block.type.toUpperCase()}</strong><br>
        ${block.start_12} – ${block.end_12}<br>
        ${block.titles ? block.titles.join("<br>") : ""}
      `;

      row.appendChild(div);
    });

    fieldCol.appendChild(row);
  });
}

// ---- INIT ----
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded fired");
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
    <p id="debugLine"></p>
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
