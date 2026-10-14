// ---- DATE KEY HELPER (NO TIMEZONE SHIFT) ----
function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- GLOBAL STATE ----
let AVAIL = null;
let currentDate = formatDateKey(new Date());
const SELECTED_COMPLEXES = new Set();

const DAY_START_MIN = 8 * 60;   // 08:00
const DAY_END_MIN   = 21 * 60;  // 21:00

// Time helpers
const HOURS = [
  "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00",
  "20:00", "21:00"
];

function timeToY(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const minutes = (h - 8) * 60 + m; // 08:00 = top
  return minutes;
}

function timeToMin(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// Human-readable date formatting (NO timezone shift)
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

// ---- INITIALIZE APP ----
document.addEventListener("DOMContentLoaded", () => {
  loadAvailability().then(() => {
    initNav();
    initDayControls();   // controls created ONCE
    renderDayTimeline(AVAIL.days[currentDate]);
    renderComplexFilters();
  });
});

// ---- LOAD availability.json ----
async function loadAvailability() {
  const resp = await fetch("data/availability.json");
  AVAIL = await resp.json();

  window.FIELD_MAP = buildFieldMap(AVAIL.fields);

  const tsEl = document.getElementById("dataTimestamp");
  if (tsEl && AVAIL.generated_at) {
    tsEl.textContent = `Data as of ${AVAIL.generated_at}`;
  }
}

// Build field map
function buildFieldMap(fieldsArray) {
  const map = {};

  fieldsArray.forEach(f => {
    map[f.id] = {
      id: f.id,
      parent: f.name === f.id ? null : f.name,
      type: f.complex,
      name: f.surface,
      halves: []
    };
  });

  Object.values(map).forEach(f => {
    if (f.parent && map[f.parent]) {
      map[f.parent].halves.push(f.id);
    }
  });

  return map;
}

// ---- NAV + VIEW SWITCHING ----
function initNav() {
  const navButtons = document.querySelectorAll(".nav button");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      switchView(view);
    });
  });
}

function switchView(view) {
  document.getElementById("dayTimeline").style.display = "none";
  document.getElementById("weekTimeline").style.display = "none";
  document.getElementById("monthTimeline").style.display = "none";
  document.getElementById("searchTimeline").style.display = "none";

  if (view === "day") {
    document.getElementById("dayTimeline").style.display = "block";
    renderDayTimeline(AVAIL.days[currentDate]);
  } else if (view === "week") {
    renderWeekTimeline();
    document.getElementById("weekTimeline").style.display = "block";
  } else if (view === "month") {
    renderMonthView();
    document.getElementById("monthTimeline").style.display = "block";
  } else if (view === "search") {
    renderSearchView();
    document.getElementById("searchTimeline").style.display = "block";
  }
}

// ---- DAY CONTROLS (created ONCE) ----
function initDayControls() {
  const container = document.getElementById("view-container");

  container.innerHTML = `
    <h2>Day View</h2>
    <div class="controls">
      <button id="prevDay">←</button>
      <span class="day-date">${formatHumanDate(currentDate)}</span>
      <button id="nextDay">→</button>
    </div>
  `;

  const prevBtn = document.getElementById("prevDay");
  const nextBtn = document.getElementById("nextDay");
  const dateSpan = container.querySelector(".day-date");

  prevBtn.addEventListener("click", () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    currentDate = formatDateKey(d);
    dateSpan.textContent = formatHumanDate(currentDate);
    renderDayTimeline(AVAIL.days[currentDate]);
    renderComplexFilters();
  });

  nextBtn.addEventListener("click", () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    currentDate = formatDateKey(d);
    dateSpan.textContent = formatHumanDate(currentDate);
    renderDayTimeline(AVAIL.days[currentDate]);
    renderComplexFilters();
  });
}

// ---- WEEK / MONTH / SEARCH ----
function renderWeekTimeline() {
  const container = document.getElementById("view-container");
  container.innerHTML = `<h2>Week View</h2>`;
  document.getElementById("weekTimeline").innerHTML = `<p>Week timeline will go here.</p>`;
}

function renderMonthView() {
  const container = document.getElementById("view-container");
  container.innerHTML = `<h2>Month View (placeholder)</h2>`;
}

function renderSearchView() {
  const container = document.getElementById("view-container");
  container.innerHTML = `<h2>Search View (placeholder)</h2>`;
}

// ---- COMPLEX FILTERS ----
function extractComplexFromSurface(surfaceName) {
  if (surfaceName.includes("Turf")) return "TURF";
  if (surfaceName.includes("Sumner")) return "SUMNER/SEAN JOYCE";
  if (surfaceName.includes("Brookville")) return "BROOKVILLE";
  if (surfaceName.includes("Butler")) return "BUTLER";
  return null;
}

function renderComplexFilters() {
  const bar = document.getElementById("complex-filters");
  bar.innerHTML = "";

  const complexes = new Set();
  Object.values(FIELD_MAP).forEach(f => {
    const loc = extractComplexFromSurface(f.name);
    if (loc) complexes.add(loc);
  });

  [...complexes].forEach(cx => {
    const btn = document.createElement("button");
    btn.className = "complex-btn";
    btn.textContent = cx;
    if (SELECTED_COMPLEXES.has(cx)) btn.classList.add("active");

    btn.addEventListener("click", () => {
      if (SELECTED_COMPLEXES.has(cx)) {
        SELECTED_COMPLEXES.delete(cx);
      } else {
        SELECTED_COMPLEXES.add(cx);
      }
      renderDayTimeline(AVAIL.days[currentDate]);
      renderComplexFilters();
    });

    bar.appendChild(btn);
  });
}

/* ------------------------------------------------------------------
   DAY VIEW: TRUE CALENDAR LAYOUT (LANES + GLOBAL AVAILABILITY)
------------------------------------------------------------------- */

function getVisibleFieldIds(dayData) {
  if (!dayData) return [];
  let fieldIds = dayData.fields.map(f => f.id);

  if (SELECTED_COMPLEXES.size > 0) {
    fieldIds = fieldIds.filter(fid => {
      const f = FIELD_MAP[fid];
      if (!f) return false;
      const cx = extractComplexFromSurface(f.name);
      return cx && SELECTED_COMPLEXES.has(cx);
    });
  }

  return fieldIds;
}

function collectEventsForDay(dayData, fieldIds) {
  const events = [];
  const eventsByField = dayData.events || {};

  fieldIds.forEach(fid => {
    (eventsByField[fid] || []).forEach(ev => {
      events.push({
        ...ev,
        startMin: timeToMin(ev.start),
        endMin: timeToMin(ev.end),
        fields: [ev.field]
      });
    });
  });

  events.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return events;
}

function assignOverlapLanes(events) {
  const lanes = [];

  events.forEach(ev => {
    let placed = false;

    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const conflict = lane.some(other =>
        !(ev.endMin <= other.startMin || ev.startMin >= other.endMin)
      );
      if (!conflict) {
        lane.push(ev);
        ev.laneIndex = i;
        placed = true;
        break;
      }
    }

    if (!placed) {
      lanes.push([ev]);
      ev.laneIndex = lanes.length - 1;
    }
  });

  return lanes.length;
}

function computeGlobalAvailability(dayData, fieldIds) {
  const availMap = dayData.availability || {};
  const eventsByField = dayData.events || {};

  const occupied = {};
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m++) {
    occupied[m] = new Set();
  }

  Object.values(eventsByField).forEach(arr => {
    arr.forEach(ev => {
      const s = timeToMin(ev.start);
      const e = timeToMin(ev.end);
      for (let m = s; m < e; m++) {
        if (m >= DAY_START_MIN && m <= DAY_END_MIN) {
          occupied[m].add(ev.field);
        }
      }
    });
  });

  Object.values(FIELD_MAP).forEach(f => {
    if (f.halves && f.halves.length > 0) {
      for (let m = DAY_START_MIN; m <= DAY_END_MIN; m++) {
        f.halves.forEach(hid => {
          if (occupied[m].has(hid)) {
            occupied[m].add(f.id);
          }
        });
      }
    }
  });

  const windows = [];
  let currentStart = null;
  let currentFieldIds = null;

  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m++) {
    const minuteFields = [];

    fieldIds.forEach(fid => {
      const arr = availMap[fid] || [];
      const isInAvailWindow = arr.some(win => {
        const s = timeToMin(win.start);
        const e = timeToMin(win.end);
        return m >= s && m < e;
      });

      const isFree = isInAvailWindow && !occupied[m].has(fid);

      if (isFree) minuteFields.push(fid);
    });

    const key = minuteFields.join("|");

    if (minuteFields.length === 0) {
      if (currentStart !== null) {
        windows.push({
          startMin: currentStart,
          endMin: m,
          fieldIds: currentFieldIds
        });
        currentStart = null;
        currentFieldIds = null;
      }
    } else {
      if (currentStart === null) {
        currentStart = m;
        currentFieldIds = [...minuteFields];
      } else {
        const prevKey = currentFieldIds.join("|");
        if (key !== prevKey) {
          windows.push({
            startMin: currentStart,
            endMin: m,
            fieldIds: currentFieldIds
          });
          currentStart = m;
          currentFieldIds = [...minuteFields];
        }
      }
    }
  }

  if (currentStart !== null) {
    windows.push({
      startMin: currentStart,
      endMin: DAY_END_MIN,
      fieldIds: currentFieldIds
    });
  }

  return windows.filter(w => w.fieldIds && w.fieldIds.length > 0);
}

function formatTime12(min) {
  let h = Math.floor(min / 60);
  let m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function buildBlockLabel(block) {
  const parts = [];
  parts.push(`${block.start}–${block.end}`);

  if (block.fields?.length) {
    const names = block.fields.map(id => FIELD_MAP[id]?.name || id);
    parts.push(names.join(", "));
  } else if (block.field) {
    const name = FIELD_MAP[block.field]?.name || block.field;
    parts.push(name);
  }

  if (block.team) parts.push(block.team);
  if (block.notes) parts.push(block.notes);
  if (block.title && !parts.includes(block.title)) parts.push(block.title);

  return parts.join(" | ");
}

// ---- DAY TIMELINE RENDERER ----
function renderDayTimeline(dayData) {
  const timelineEl = document.getElementById("dayTimeline");

  if (!dayData) {
    timelineEl.innerHTML = `
      <div class="time-ruler"></div>
      <div class="timeline-column">
        <p>No data for this date.</p>
      </div>
    `;
    return;
  }

  const fieldIds = getVisibleFieldIds(dayData);

  if (fieldIds.length === 0) {
    timelineEl.innerHTML = `
      <div class="time-ruler"></div>
      <div class="timeline-column">
        <p>No fields selected.</p>
      </div>
    `;
    return;
  }

  const events = collectEventsForDay(dayData, fieldIds);
  const eventLaneCount = events.length > 0 ? assignOverlapLanes(events) : 1;
  const availWindows = computeGlobalAvailability(dayData, fieldIds);

  const totalLaneCount = eventLaneCount + 1;

  timelineEl.innerHTML = `
    <div class="time-ruler"></div>
    <div class="timeline-column"></div>
  `;

  const ruler = timelineEl.querySelector(".time-ruler");
  const column = timelineEl.querySelector(".timeline-column");

  HOURS.forEach(h => {
    const y = timeToY(h);
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = `${y}px`;
    label.textContent = h;
    ruler.appendChild(label);
  });

  const laneWidth = 720 / totalLaneCount;
  const availLaneIndex = totalLaneCount - 1;

  availWindows.forEach(win => {
    const top = win.startMin - DAY_START_MIN;
    const height = win.endMin - win.startMin;

    const div = document.createElement("div");
    div.className = "timeline-block block-available";
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;
    div.style.left = `${availLaneIndex * laneWidth}px`;
    div.style.width = `${laneWidth - 8}px`;

    const startStr = formatTime12(win.startMin);
    const endStr = formatTime12(win.endMin);

    const fieldNames = win.fieldIds
      .map(fid => FIELD_MAP[fid]?.name || fid)
      .join(", ");

    div.textContent = `Available: ${fieldNames} | ${startStr}–${endStr}`;
    column.appendChild(div);
  });

  events.forEach(ev => {
    const top = ev.startMin - DAY_START_MIN;
    const height = ev.endMin - ev.startMin;
    const left = ev.laneIndex * laneWidth;

    const div = document.createElement("div");
    div.className = `timeline-block block-${ev.type}`;
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;
    div.style.left = `${left}px`;
    div.style.width = `${laneWidth - 8}px`;

    div.textContent = buildBlockLabel(ev);
    column.appendChild(div);
  });
}
