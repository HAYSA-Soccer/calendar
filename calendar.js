// calendar.js — v8 (multi-select filters + sunset + 2h grid)

// ---- GLOBAL STATE ----
let SEARCH = null;
let AVAIL = null;

let FILTER_COMPLEXES = new Set(); // multi-select
let VIEW_MODE = "week"; // default to week view
let currentDate = new Date();
let LAST_UPDATED = null;

// ---- TIME CONSTANTS ----
const START_HOUR = 8;
const END_HOUR = 21;
const PIXELS_PER_MIN = 0.5; // compact height
const GRID_INTERVAL_MIN = 120; // 2 hours

// ---- LOAD JSON ----
async function loadSearchIndex() {
  const resp = await fetch("data/search_index.json");
  SEARCH = await resp.json();
}

async function loadAvailability() {
  const resp = await fetch("data/availability.json");
  AVAIL = await resp.json();

  LAST_UPDATED = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const el = document.getElementById("lastUpdated");
  if (el) el.textContent = `Last updated: ${LAST_UPDATED}`;
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
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
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

  Object.keys(eventsByField).forEach(fieldId => {
    eventsByField[fieldId].forEach(ev => {
      if (ev.field_group) {
        const loc = capitalizeLocation(ev.field_group);
        if (loc) map[fieldId] = loc;
      }
    });
  });

  dayData.fields.forEach(f => {
    if (!map[f.id]) {
      const parent = f.name;
      if (map[parent]) {
        map[f.id] = map[parent];
      }
    }
  });

  return map;
}

// ---- SUBTRACT HALF-FIELD USAGE FROM FULL-FIELD AVAILABILITY ----
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

// ---- MERGE SAME-TIME BLOCKS PER FIELD ----
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

// ---- MERGE ADJACENT SLICES WITH IDENTICAL FIELD STATES ----
function mergeSlices(slices) {
  const merged = [];
  let current = null;

  slices.forEach(slice => {
    if (!current) {
      current = { ...slice };
      return;
    }

    const same =
      JSON.stringify(slice.fields) === JSON.stringify(current.fields);

    if (same) {
      current.end = slice.end;
    } else {
      merged.push(current);
      current = { ...slice };
    }
  });

  if (current) merged.push(current);

  return merged;
}

// ---- BUILD BLOCKS FOR A FIELD ----
function buildFieldBlocks(fieldId, dayData, FIELD_MAP) {
  const type = FIELD_MAP[fieldId].type;
  let blocks = [];

  if (type === "full") {
    let fullAvail = dayData.availability[fieldId] || [];

    const halfFields = dayData.fields.filter(f =>
      f.parent === fieldId && f.complex === "half"
    );

    const halfUsage = [];
    halfFields.forEach(h => {
      const events = dayData.events[h.id] || [];
      events.forEach(ev => {
        halfUsage.push({ start: ev.start, end: ev.end });
      });
    });

    if (fullAvail.length === 0) {
      const startStr = `${String(START_HOUR).padStart(2, "0")}:00`;
      const endStr = `${String(END_HOUR).padStart(2, "0")}:00`;
      fullAvail = [{ start: startStr, end: endStr }];
      const trueAvail = fullAvail;

      blocks = trueAvail.map(win => ({
        field: fieldId,
        type: "free",
        start: win.start,
        end: win.end,
        start_12: to12h(win.start),
        end_12: to12h(win.end),
        title: null
      }));
    } else {
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

// ---- BUILD TIME SLICES FOR A COMPLEX ----
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

  return mergeSlices(slices);
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

// ---- FILTER BAR (multi-select) ----
function renderFilters(fields, FIELD_COMPLEX_MAP) {
  const filterDiv = document.getElementById("filter-bar");
  filterDiv.innerHTML = "";

  const locations = [...new Set(
    fields.map(f => FIELD_COMPLEX_MAP[f.id]).filter(Boolean)
  )];

  // Initialize filter set if empty: all selected
  if (FILTER_COMPLEXES.size === 0) {
    locations.forEach(loc => FILTER_COMPLEXES.add(loc));
  }

  const locContainer = document.createElement("div");
  locContainer.className = "filter-button-group";

  locations.forEach(loc => {
    const btn = document.createElement("button");
    btn.textContent = loc;
    const isActive = FILTER_COMPLEXES.has(loc);
    btn.className = isActive ? "filter-btn active" : "filter-btn";
    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(loc)) {
        FILTER_COMPLEXES.delete(loc);
      } else {
        FILTER_COMPLEXES.add(loc);
      }
      // If user deselects everything, reselect all to avoid empty screen
      if (FILTER_COMPLEXES.size === 0) {
        locations.forEach(l => FILTER_COMPLEXES.add(l));
      }
      render();
    };
    locContainer.appendChild(btn);
  });

  filterDiv.appendChild(locContainer);
}

// ---- GRID LINES + SUNSET (shared) ----
function renderTimeGridLines(container) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  for (let m = 0; m <= totalMinutes; m += GRID_INTERVAL_MIN) {
    const top = m * PIXELS_PER_MIN;
    const line = document.createElement("div");
    line.className = "time-grid-line";
    line.style.top = `${top}px`;
    container.appendChild(line);
  }
}

function renderSunsetLine(container, dayData) {
  if (!dayData || !dayData.sunset) return;
  const sunsetMin = timeToMinutes(dayData.sunset) - START_HOUR * 60;
  if (sunsetMin < 0 || sunsetMin > (END_HOUR - START_HOUR) * 60) return;

  const top = sunsetMin * PIXELS_PER_MIN;
  const line = document.createElement("div");
  line.className = "sunset-line";
  line.style.top = `${top}px`;

  const label = document.createElement("div");
  label.className = "sunset-label";
  label.textContent = `Sunset ${to12h(dayData.sunset)}`;

  line.appendChild(label);
  container.appendChild(line);
}

// ---- DAY VIEW: SINGLE DATE, COMPLEXES SIDE-BY-SIDE ----
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

  // Time labels
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const top = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = `${top}px`;
    label.textContent = to12h(`${String(h).padStart(2, "0")}:00`);
    timeCol.appendChild(label);
  }

  // Grid lines + sunset
  renderTimeGridLines(complexWrapper);
  renderSunsetLine(complexWrapper, dayData);

  const legend = document.createElement("div");
  legend.className = "timeline-legend";
  legend.innerHTML = `
    <span class="legend-item legend-free">Availability</span>
    <span class="legend-item legend-practice">Practice</span>
    <span class="legend-item legend-game">Game</span>
    <span class="legend-item legend-admin">Admin</span>
  `;
  complexWrapper.appendChild(legend);

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
    if (!FILTER_COMPLEXES.has(loc)) return;

    const complexFields = complexes[loc];
    if (complexFields.length === 0) return;

    const complexContainer = document.createElement("div");
    complexContainer.className = "complex-column";

    const complexHeader = document.createElement("h3");
    complexHeader.textContent = loc;

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "▼";
    toggleBtn.className = "complex-toggle";
    toggleBtn.onclick = () => {
      complexRow.style.display =
        complexRow.style.display === "none" ? "block" : "none";
    };
    complexHeader.appendChild(toggleBtn);

    complexContainer.appendChild(complexHeader);

    const complexRow = document.createElement("div");
    complexRow.className = "complex-row";
    complexRow.style.height = `${(END_HOUR - START_HOUR) * 60 * PIXELS_PER_MIN}px`;
    complexContainer.appendChild(complexRow);

    const slices = buildComplexSlices(complexFields, dayData, FIELD_MAP);

    // Skip empty complexes
    if (slices.length === 0) return;

    slices.forEach(slice => {
      const startMin = timeToMinutes(slice.start) - START_HOUR * 60;
      const endMin = timeToMinutes(slice.end) - START_HOUR * 60;

      const { events, freeFields, laneCount } = assignEventLanes(slice);

      const hasAvailabilityLane = freeFields.length > 0;
      const totalLanes = laneCount + (hasAvailabilityLane ? 1 : 0);
      const laneWidthPercent = 100 / totalLanes;

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
          <div class="block-time">${to12h(slice.start)} – ${to12h(slice.end)}</div>
          <div class="block-main">Available</div>
        `;
        blockDiv.title = `Available: ${freeLabels}`;

        complexRow.appendChild(blockDiv);
      }

      events.forEach(ev => {
        const blockDiv = document.createElement("div");
        const colorType = classifyColor(ev);
        blockDiv.className = `timeline-block timeline-${colorType}`;

        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${ev._lane * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;

        const labelFull = ev.title || ev.status.toUpperCase();
        const shortLabel = labelFull.split("(")[0].trim();

        blockDiv.innerHTML = `
          <div class="block-time">${to12h(slice.start)} – ${to12h(slice.end)}</div>
          <div class="block-main">${shortLabel}</div>
        `;
        blockDiv.title = `${labelFull} — ${ev.label}`;

        complexRow.appendChild(blockDiv);
      });
    });

    complexRowContainer.appendChild(complexContainer);
  });
}

// ---- DAY VIEW WRAPPER ----
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  renderDayTimelineForDate(currentDate, tl);
}

// ---- WEEK VIEW: 7 DAYS, COMPLEXES SIDE-BY-SIDE ----
function renderWeekView() {
  const weekContainer = document.getElementById("weekTimeline");

  weekContainer.innerHTML = `
    <div class="timeline-times"></div>
    <div class="week-days-container"></div>
  `;

  const timeCol = weekContainer.querySelector(".timeline-times");
  const daysContainer = weekContainer.querySelector(".week-days-container");

  // Time labels
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

  const complexes = {};
  fields.forEach(f => {
    const loc = FIELD_COMPLEX_MAP[f.id];
    if (!loc) return;
    if (!complexes[loc]) complexes[loc] = [];
    complexes[loc].push(f);
  });

  const locKeys = Object.keys(complexes).filter(loc => FILTER_COMPLEXES.has(loc));

  if (locKeys.length === 0) {
    container.innerHTML = `<p class="no-data">No fields for selected locations.</p>`;
    return;
  }

  container.style.display = "flex";
  container.style.flexDirection = "row";
  container.style.gap = "8px";
  container.style.position = "relative";

  // Grid lines + sunset
  renderTimeGridLines(container);
  renderSunsetLine(container, dayData);

  locKeys.forEach(loc => {
    const complexFields = complexes[loc];

    const complexCol = document.createElement("div");
    complexCol.className = "week-complex-column";
    complexCol.dataset.loc = loc;

    const header = document.createElement("div");
    header.textContent = loc;

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "▼";
    toggleBtn.className = "complex-toggle";
    toggleBtn.onclick = () => {
      inner.style.display =
        inner.style.display === "none" ? "block" : "none";
    };
    header.appendChild(toggleBtn);

    complexCol.appendChild(header);

    const inner = document.createElement("div");
    inner.style.position = "relative";
    inner.style.height = `${(END_HOUR - START_HOUR) * 60 * PIXELS_PER_MIN}px`;
    complexCol.appendChild(inner);

    const slices = buildComplexSlices(complexFields, dayData, FIELD_MAP);

    // Skip empty complexes
    if (slices.length === 0) return;

    slices.forEach(slice => {
      const startMin = timeToMinutes(slice.start) - START_HOUR * 60;
      const endMin = timeToMinutes(slice.end) - START_HOUR * 60;

      const { events, freeFields, laneCount } = assignEventLanes(slice);

      const hasAvailabilityLane = freeFields.length > 0;
      const totalLanes = laneCount + (hasAvailabilityLane ? 1 : 0);
      const laneWidthPercent = 100 / totalLanes;

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
          <div class="block-time">${to12h(slice.start)} – ${to12h(slice.end)}</div>
          <div class="block-main">Available</div>
        `;
        blockDiv.title = `Available: ${freeLabels}`;

        inner.appendChild(blockDiv);
      }

      events.forEach(ev => {
        const blockDiv = document.createElement("div");
        blockDiv.className = `timeline-block timeline-${classifyColor(ev)}`;

        blockDiv.style.top = `${startMin * PIXELS_PER_MIN}px`;
        blockDiv.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;
        blockDiv.style.left = `${ev._lane * laneWidthPercent}%`;
        blockDiv.style.width = `${laneWidthPercent}%`;

        const labelFull = ev.title || ev.status.toUpperCase();
        const shortLabel = labelFull.split("(")[0].trim();

        blockDiv.innerHTML = `
          <div class="block-time">${to12h(slice.start)} – ${to12h(slice.end)}</div>
          <div class="block-main">${shortLabel}</div>
        `;
        blockDiv.title = `${labelFull} — ${ev.label}`;

        inner.appendChild(blockDiv);
      });
    });

    container.appendChild(complexCol);
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
        <button id="todayBtn" class="nav-btn">Today</button>
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

  document.getElementById("dayModeBtn").onclick = () => {
    VIEW_MODE = "day";
    render();
  };
  document.getElementById("weekModeBtn").onclick = () => {
    VIEW_MODE = "week";
    render();
  };

  document.getElementById("prevPeriod").onclick = () => {
    currentDate.setDate(currentDate.getDate() + (VIEW_MODE === "day" ? -1 : -7));
    render();
  };

  document.getElementById("nextPeriod").onclick = () => {
    currentDate.setDate(currentDate.getDate() + (VIEW_MODE === "day" ? 1 : 7));
    render();
  };

  document.getElementById("todayBtn").onclick = () => {
    currentDate = new Date();
    render();
  };

  // For filters, we need fields from current day/week
  if (AVAIL && AVAIL.days) {
    const dayData = AVAIL.days[formatDateKey(currentDate)];
    if (dayData) {
      const FIELD_COMPLEX_MAP = buildFieldComplexMapForDay(dayData);
      renderFilters(dayData.fields, FIELD_COMPLEX_MAP);
    } else {
      // fallback: use first available day
      const keys = Object.keys(AVAIL.days);
      if (keys.length > 0) {
        const anyDay = AVAIL.days[keys[0]];
        const FIELD_COMPLEX_MAP = buildFieldComplexMapForDay(anyDay);
        renderFilters(anyDay.fields, FIELD_COMPLEX_MAP);
      }
    }
  }

  if (VIEW_MODE === "day") {
    renderTimeline();
  } else {
    renderWeekView();
  }
}
