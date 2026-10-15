let SEARCH = null;
let AVAIL = null;

// Filters
let FILTER_COMPLEX = "all";
let FILTER_FIELDS = new Set();

// Load JSON
async function loadSearchIndex() {
  const resp = await fetch("data/search_index.json");
  SEARCH = await resp.json();
}

async function loadAvailability() {
  const resp = await fetch("data/availability.json");
  AVAIL = await resp.json();
}

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

// ---- SUBTRACT HALF-FIELD USAGE ----
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

// ---- BUILD TIME SLICES ----
function buildComplexSlices(complexFields, dayData, FIELD_MAP) {
  const changePoints = new Set();
  const perFieldBlocks = {};

  complexFields.forEach(field => {
    const fid = field.id;
    const blocks = buildFieldBlocks(fid, dayData, FIELD_MAP);
    perFieldBlocks[fid] = blocks;

    blocks.forEach(b => {
      changePoints.add(b.start);
      changePoints.add(b.end);
    });
  });

  const points = Array.from(changePoints).sort((a, b) => a.localeCompare(b));

  const slices = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const slice = {
      start,
      end,
      fields: []
    };

    complexFields.forEach(field => {
      const fid = field.id;
      const blocks = perFieldBlocks[fid];

      let status = "free";
      let title = null;

      blocks.forEach(b => {
        if (b.start <= start && b.end >= end && b.type !== "free") {
          status = b.type;
          title = (b.titles && b.titles.length) ? b.titles.join(", ") : b.title;
        }
      });

      slice.fields.push({
        id: fid,
        label: FIELD_MAP[fid].surface,
        status,
        title
      });
    });

    slices.push(slice);
  }

  return slices;
}

// ---- ASSIGN LANES ----
function assignEventLanes(slice) {
  const events = slice.fields.filter(f => f.status !== "free");
  const lanes = [];

  events.forEach(ev => {
    let laneIndex = lanes.length;
    lanes.push(ev);
    ev._lane = laneIndex;
  });

  const freeFields = slice.fields.filter(f => f.status === "free");

  return {
    events,
    freeFields,
    laneCount: lanes.length
  };
}

// ---- GLOBAL STATE ----
let currentDate = new Date();

// ---- FILTER BAR ----
function renderFilters(fields) {
  const filterDiv = document.getElementById("filter-bar");
  filterDiv.innerHTML = "";

  const complexes = [...new Set(fields.map(f => f.name))];

  const complexSelect = document.createElement("select");
  complexSelect.innerHTML = `<option value="all">All Complexes</option>`;
  complexes.forEach(c => {
    complexSelect.innerHTML += `<option value="${c}">${c}</option>`;
  });
  complexSelect.value = FILTER_COMPLEX;
  complexSelect.onchange = () => {
    FILTER_COMPLEX = complexSelect.value;
    FILTER_FIELDS.clear();
    render();
  };

  filterDiv.appendChild(complexSelect);

  const fieldSelect = document.createElement("select");
  fieldSelect.innerHTML = `<option value="all">All Fields</option>`;
  fields.forEach(f => {
    fieldSelect.innerHTML += `<option value="${f.id}">${f.surface}</option>`;
  });
  fieldSelect.onchange = () => {
    FILTER_FIELDS.clear();
    if (fieldSelect.value !== "all") FILTER_FIELDS.add(fieldSelect.value);
    render();
  };

  filterDiv.appendChild(fieldSelect);
}

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

  renderFilters(fields);

  const FIELD_MAP = {};
  fields.forEach(f => {
    FIELD_MAP[f.id] = {
      id: f.id,
      parent: f.name,
      type: f.complex,
      surface: f.surface,
      location: f.name // THIS IS THE FIX
    };
  });

  const START_HOUR = 8;
  const END_HOUR = 21;
  const PIXELS_PER_MIN = 2;

  // Time ruler
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = `${top}px`;
    label.textContent = to12h(`${String(h).padStart(2, "0")}:00`);
    timeCol.appendChild(label);
  }

  // Legend
  const legend = document.createElement("div");
  legend.className = "timeline-legend";
  legend.innerHTML = `
    <span class="legend-item legend-free">Free</span>
    <span class="legend-item legend-reserved">Reserved</span>
  `;
  complexCol.appendChild(legend);

  // Group fields by complex (using name)
  const complexes = {};
  fields.forEach(f => {
    const loc = f.name;
    if (!complexes[loc]) complexes[loc] = [];
    complexes[loc].push(f);
  });

  Object.keys(complexes).forEach(loc => {
    if (FILTER_COMPLEX !== "all" && FILTER_COMPLEX !== loc) return;

    const complexFields = complexes[loc].filter(f => {
      return FILTER_FIELDS.size === 0 || FILTER_FIELDS.has(f.id);
    });

    if (complexFields.length === 0) return;

    const complexContainer = document.createElement("div");
    complexContainer.className = "complex-column";

    const complexHeader = document.createElement("h3");
    complexHeader.textContent = loc;
    complexContainer.appendChild(complexHeader);

    const complexRow = document.createElement("div");
    complexRow.className = "complex-row";
    complexRow.style.height = `${(END_HOUR - START_HOUR) * 60 * PIXELS_PER_MIN}px`;
    complexContainer.appendChild(complexRow);

    const slices = buildComplexSlices(complexFields, dayData, FIELD_MAP);

    slices.forEach(slice => {
      const startMin = timeToMinutes(slice.start) - START_HOUR * 60;
      const endMin = timeToMinutes(slice.end) - START_HOUR * 60;

      const { events, freeFields, laneCount } = assignEventLanes(slice);

      const totalLanes = laneCount + (freeFields.length > 0 ? 1 : 0);
      if (totalLanes === 0) return;

      const laneWidthPercent = 100 / totalLanes;

      // Event lanes
      events.forEach(ev => {
        const blockDiv = document.createElement("div");
        blockDiv.className = "timeline-block timeline-block-reserved";

        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${ev._lane * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;

        const label = ev.title || ev.status.toUpperCase();
        blockDiv.innerHTML = `
          ${to12h(slice.start)} – ${to12h(slice.end)}<br>
          ${label} — ${ev.label}
        `;

        complexRow.appendChild(blockDiv);
      });

      // Availability lane
      if (freeFields.length > 0) {
        const blockDiv = document.createElement("div");
        blockDiv.className = "timeline-block timeline-block-free";

        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${laneCount * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;

        const freeLabels = freeFields.map(f => f.label).join(", ");
        blockDiv.innerHTML = `
          <strong>Available:</strong><br>
          ${freeLabels}
        `;

        complexRow.appendChild(blockDiv);
      }
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
    <div id="filter-bar" class="filter-bar"></div>
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
