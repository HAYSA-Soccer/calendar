// calendar.js — clean UI, day + week views, complexes side-by-side, filters, no hard-coded dates

let SEARCH = null;
let AVAIL = null;

// Filters
let FILTER_COMPLEX = "all";

// View mode: "day" or "week" (default week)
let VIEW_MODE = "week";

// Time constants
const START_HOUR = 8;
const END_HOUR = 21;
const PIXELS_PER_MIN = 1;

// ---- LOAD JSON ----
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

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric"
  });
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  d.setDate(d.getDate() + diff);
  return d;
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

// ---- LOCATION HELPERS ----
function capitalizeLocation(raw) {
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Build field → location map for a given day
function buildFieldComplexMapForDay(dayData) {
  const map = {};
  const eventsByField = dayData.events || {};

  // 1. Assign locations from events (field_group)
  Object.keys(eventsByField).forEach(fieldId => {
    eventsByField[fieldId].forEach(ev => {
      if (ev.field_group) {
        const loc = capitalizeLocation(ev.field_group);
        if (loc) map[fieldId] = loc;
      }
    });
  });

  // 2. Assign missing fields based on parent full-field
  dayData.fields.forEach(f => {
    if (!map[f.id]) {
      const parent = f.name; // full-field parent id
      if (map[parent]) {
        map[f.id] = map[parent];
      }
    }
  });

  return map;
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

function classifyColor(ev) {
  const s = ev.status;

  if (s === "free") return "free";
  if (s === "practice") return "practice";
  if (s === "game") return "game";

  return "admin";
}

// ---- BUILD BLOCKS FOR A FIELD ----
function buildFieldBlocks(fieldId, dayData, FIELD_MAP) {
  const type = FIELD_MAP[fieldId].type;
  let blocks = [];

  if (type === "full") {
    let fullAvail = dayData.availability[fieldId] || [];

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

    // Fallback: if no availability and no usage, treat as fully available for the day
    if (fullAvail.length === 0 && halfUsage.length === 0) {
      const startStr = `${String(START_HOUR).padStart(2, "0")}:00`;
      const endStr = `${String(END_HOUR).padStart(2, "0")}:00`;
      fullAvail = [{ start: startStr, end: endStr }];
    }

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
    const laneIndex = lanes.length;
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
let currentDate = new Date(); // today

// ---- FILTER BAR (LOCATION BUTTONS ONLY) ----
function renderFilters(fields, FIELD_COMPLEX_MAP) {
  const filterDiv = document.getElementById("filter-bar");
  filterDiv.innerHTML = "";

  const locations = [...new Set(
    fields.map(f => FIELD_COMPLEX_MAP[f.id]).filter(Boolean)
  )];

  const locContainer = document.createElement("div");
  locContainer.className = "filter-button-group";

  const allBtn = document.createElement("button");
  allBtn.textContent = "All Locations";
  allBtn.className = FILTER_COMPLEX === "all" ? "filter-btn active" : "filter-btn";
  allBtn.onclick = () => {
    FILTER_COMPLEX = "all";
    render();
  };
  locContainer.appendChild(allBtn);

  locations.forEach(loc => {
    const btn = document.createElement("button");
    btn.textContent = loc;
    btn.className = FILTER_COMPLEX === loc ? "filter-btn active" : "filter-btn";
    btn.onclick = () => {
      FILTER_COMPLEX = loc;
      render();
    };
    locContainer.appendChild(btn);
  });

  filterDiv.appendChild(locContainer);
}

// ---- CORE TIMELINE RENDER FOR A SINGLE DAY (DAY VIEW, complexes side-by-side) ----
function renderDayTimelineForDate(dateObj, container) {
  const dateKey = formatDateKey(dateObj);

  container.innerHTML = `
    <div class="timeline-times"></div>
    <div class="day-complexes"></div>
  `;

  const timeCol = container.querySelector(".timeline-times");
  const complexWrapper = container.querySelector(".day-complexes");

  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    complexWrapper.innerHTML = `<p class="no-data">No availability for this date.</p>`;
    return;
  }

  const dayData = AVAIL.days[dateKey];
  const fields = dayData.fields;

  const FIELD_COMPLEX_MAP = buildFieldComplexMapForDay(dayData);

  // Filters only in Day View container
  renderFilters(fields, FIELD_COMPLEX_MAP);

  const FIELD_MAP = {};
  fields.forEach(f => {
    FIELD_MAP[f.id] = {
      id: f.id,
      parent: f.name,
      type: f.complex,
      surface: f.surface,
      location: FIELD_COMPLEX_MAP[f.id] || null
    };
  });

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
    <span class="legend-item legend-free">Availability</span>
    <span class="legend-item legend-practice">Practice</span>
    <span class="legend-item legend-game">Game</span>
    <span class="legend-item legend-admin">Admin</span>
  `;
  complexWrapper.appendChild(legend);

  // Group fields by location
  const complexes = {};
  fields.forEach(f => {
    const loc = FIELD_COMPLEX_MAP[f.id];
    if (!loc) return;
    if (!complexes[loc]) complexes[loc] = [];
    complexes[loc].push(f);
  });

  const complexRowContainer = document.createElement("div");
  complexRowContainer.style.display = "flex";
  complexRowContainer.style.flexDirection = "row";
  complexRowContainer.style.gap = "12px";
  complexRowContainer.style.width = "100%";
  complexRowContainer.style.position = "relative";
  complexRowContainer.style.marginTop = "4px";
  complexWrapper.appendChild(complexRowContainer);

  Object.keys(complexes).forEach(loc => {
    if (FILTER_COMPLEX !== "all" && FILTER_COMPLEX !== loc) return;

    const complexFields = complexes[loc];
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

      const hasAvailabilityLane = freeFields.length > 0;
      const totalLanes = laneCount + (hasAvailabilityLane ? 1 : 0);
      const laneWidthPercent = 100 / totalLanes;

      // Availability lane (merged if identical)
      if (hasAvailabilityLane) {
        const allSame = freeFields.every(f => f.label === freeFields[0].label);
        const freeLabels = allSame
          ? freeFields[0].label
          : freeFields.map(f => f.label).join(", ");
      
        const blockDiv = document.createElement("div");
        blockDiv.className = "timeline-block timeline-free";
      
        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${laneCount * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;
      
        blockDiv.innerHTML = `
          <strong>Available:</strong><br>
          ${freeLabels}
        `;
      
        complexRow.appendChild(blockDiv);
      }


      // Event lanes (practice = green, game = blue, admin = red)
      events.forEach(ev => {
        const blockDiv = document.createElement("div");

        const colorType = classifyColor(ev);
        blockDiv.className = `timeline-block timeline-${colorType}`;

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
    });

    complexRowContainer.appendChild(complexContainer);
  });
}

// ---- DAY VIEW TIMELINE WRAPPER ----
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  renderDayTimelineForDate(currentDate, tl);
}

// ---- WEEK VIEW (horizontal, complexes side-by-side, filterable) ----
function renderWeekView() {
  const weekContainer = document.getElementById("weekTimeline");

  weekContainer.innerHTML = `
    <div class="timeline-times"></div>
    <div class="week-days-container"></div>
  `;

  const timeCol = weekContainer.querySelector(".timeline-times");
  const daysContainer = weekContainer.querySelector(".week-days-container");

  // Shared time ruler
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = `${top}px`;
    label.textContent = to12h(`${String(h).padStart(2, "0")}:00`);
    timeCol.appendChild(label);
  }

  const monday = getMondayOfWeek(currentDate);

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateKey = formatDateKey(day);

    const dayCol = document.createElement("div");
    dayCol.className = "week-day-column";

    // Today highlight
    if (dateKey === formatDateKey(new Date())) {
      dayCol.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "week-day-header";
    header.textContent = formatShortDate(dateKey);
    dayCol.appendChild(header);

    const dayTimeline = document.createElement("div");
    dayTimeline.className = "week-day-timeline";
    dayCol.appendChild(dayTimeline);

    daysContainer.appendChild(dayCol);

    renderWeekDayColumn(day, dayTimeline);
  }
}

function renderWeekDayColumn(dateObj, container) {
  const dateKey = formatDateKey(dateObj);

  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    container.innerHTML = `<p class="no-data">No availability.</p>`;
    return;
  }

  const dayData = AVAIL.days[dateKey];
  const fields = dayData.fields;

  const FIELD_COMPLEX_MAP = buildFieldComplexMapForDay(dayData);

  const FIELD_MAP = {};
  fields.forEach(f => {
    FIELD_MAP[f.id] = {
      id: f.id,
      parent: f.name,
      type: f.complex,
      surface: f.surface,
      location: FIELD_COMPLEX_MAP[f.id] || null
    };
  });

  // Group fields by location
  const complexes = {};
  fields.forEach(f => {
    const loc = FIELD_COMPLEX_MAP[f.id];
    if (!loc) return;
    if (!complexes[loc]) complexes[loc] = [];
    complexes[loc].push(f);
  });

  // Filter complexes (A with ability to remove certain complexes)
  const locKeys = Object.keys(complexes).filter(loc => {
    if (FILTER_COMPLEX === "all") return true;
    return FILTER_COMPLEX === loc;
  });

  if (locKeys.length === 0) {
    container.innerHTML = `<p class="no-data">No fields for this location.</p>`;
    return;
  }

  locKeys.forEach(loc => {
    const complexFields = complexes[loc];

    const complexCol = document.createElement("div");
    complexCol.className = "week-complex-column";
    container.appendChild(complexCol);

    const slices = buildComplexSlices(complexFields, dayData, FIELD_MAP);

    slices.forEach(slice => {
      const startMin = timeToMinutes(slice.start) - START_HOUR * 60;
      const endMin = timeToMinutes(slice.end) - START_HOUR * 60;

      const { events, freeFields, laneCount } = assignEventLanes(slice);

      const hasAvailabilityLane = freeFields.length > 0;
      const totalLanes = laneCount + (hasAvailabilityLane ? 1 : 0);
      const laneWidthPercent = 100 / totalLanes;

      // Availability lane (merged if identical)
      if (hasAvailabilityLane) {
        const allSame = freeFields.every(f => f.label === freeFields[0].label);
        const freeLabels = allSame
          ? freeFields[0].label
          : freeFields.map(f => f.label).join(", ");
      
        const blockDiv = document.createElement("div");
        blockDiv.className = "timeline-block timeline-free";
      
        blockDiv.style.top = `${startMin}px`;
        blockDiv.style.height = `${endMin - startMin}px`;
        blockDiv.style.left = `${laneCount * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;
      
        blockDiv.innerHTML = `
          <strong>Available:</strong><br>
          ${freeLabels}
        `;
      
        complexCol.appendChild(blockDiv);
      }


      // Events
      events.forEach(ev => {
        const blockDiv = document.createElement("div");
        blockDiv.className = `timeline-block timeline-${classifyColor(ev)}`;

        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${ev._lane * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;

        blockDiv.innerHTML = `
          ${to12h(slice.start)} – ${to12h(slice.end)}<br>
          ${ev.title || ev.status.toUpperCase()}<br>
          ${ev.label}
        `;

        complexCol.appendChild(blockDiv);
      });
    });
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

  const monday = getMondayOfWeek(currentDate);
  const mondayKey = formatDateKey(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayKey = formatDateKey(sunday);

  const weekLabel = `${formatShortDate(mondayKey)} – ${formatShortDate(sundayKey)}`;

  container.innerHTML = `
    <div class="view-header">
      <div class="view-mode-toggle">
        <button id="dayModeBtn" class="${VIEW_MODE === "day" ? "mode-btn active" : "mode-btn"}">Day</button>
        <button id="weekModeBtn" class="${VIEW_MODE === "week" ? "mode-btn active" : "mode-btn"}">Week</button>
      </div>
      <div class="controls">
        <button id="prevPeriod" class="nav-btn">←</button>
        <span class="period-label">
          ${VIEW_MODE === "day" ? humanDate : `Week of ${weekLabel}`}
        </span>
        <button id="nextPeriod" class="nav-btn">→</button>
      </div>
    </div>
    <div id="filter-bar" class="filter-bar"></div>
    <div id="dayTimeline" class="${VIEW_MODE === "day" ? "" : "hidden"}"></div>
    <div id="weekTimeline" class="${VIEW_MODE === "week" ? "" : "hidden"}"></div>
  `;

  // Mode toggle
  document.getElementById("dayModeBtn").onclick = () => {
    VIEW_MODE = "day";
    render();
  };
  document.getElementById("weekModeBtn").onclick = () => {
    VIEW_MODE = "week";
    render();
  };

  // Navigation (day vs week)
  document.getElementById("prevPeriod").onclick = () => {
    if (VIEW_MODE === "day") {
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() - 7);
    }
    render();
  };

  document.getElementById("nextPeriod").onclick = () => {
    if (VIEW_MODE === "day") {
      currentDate.setDate(currentDate.getDate() + 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 7);
    }
    render();
  };

  // Render appropriate view
  if (VIEW_MODE === "day") {
    renderTimeline();
  } else {
    renderWeekView();
  }
}
