// ------------------------------------------------------------
// calendar.js — FULL PATCHED VERSION
// ------------------------------------------------------------

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
  try {
    const res = await fetch("data/availability.json");
    if (!res.ok) {
      console.error("Failed to fetch availability.json", res.status);
      return;
    }

    const data = await res.json();

    AVAIL = {};

    // Your JSON uses: days: { "2026-10-12": { ... }, ... }
    if (data.days && typeof data.days === "object" && !Array.isArray(data.days)) {
      Object.keys(data.days).forEach(dateKey => {
        const day = data.days[dateKey];
        AVAIL[dateKey] = day;
      });
    } else {
      console.error("availability.json missing 'days' object");
    }

    const stamp = document.getElementById("lastUpdated");
    if (stamp && data.lastUpdated) {
      stamp.textContent = `Last updated: ${data.lastUpdated}`;
    }

    console.log("Availability loaded. Keys:", Object.keys(AVAIL));
  } catch (err) {
    console.error("Error loading availability.json", err);
  }
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
  if (!t || typeof t !== "string") {
    console.warn("Invalid time for to12h:", t);
    return "";
  }

  const parts = t.split(":");
  if (parts.length !== 2) {
    console.warn("Malformed time string for to12h:", t);
    return "";
  }

  let [h, m] = parts.map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;

  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}


function timeToMinutes(t) {
  if (!t || typeof t !== "string") {
    console.warn("Invalid time value:", t);
    return 0;
  }

  const parts = t.split(":");
  if (parts.length !== 2) {
    console.warn("Malformed time string:", t);
    return 0;
  }

  const [h, m] = parts.map(Number);
  return h * 60 + m;
}


// ---- COMPLEX MAPPING ----
// Maps each field ID to one of your four complexes
function buildFieldComplexMapForDay(dayData) {
  const map = {};

  dayData.fields.forEach(f => {
    const surf = f.surface.toLowerCase();

    if (surf.includes("turf")) {
      map[f.id] = "Holbrook HS Turf";
    } else if (surf.includes("sumner") || surf.includes("sj")) {
      map[f.id] = "Sumner / Sean Joyce Fields";
    } else if (surf.includes("brookville")) {
      map[f.id] = "Brookville Fields";
    } else if (surf.includes("butler")) {
      map[f.id] = "Avon Butler Fields";
    } else {
      map[f.id] = "Other";
    }
  });

  return map;
}


// ------------------------------------------------------------
// BUILD DAY AVAILABILITY (SUPPORTS YOUR JSON FORMAT)
// ------------------------------------------------------------
function buildDayAvailability(dayData) {
  const result = {};

  // Your JSON uses: dayData.availability[fieldId] = [ {start, end}, ... ]
  if (dayData.availability) {
    Object.keys(dayData.availability).forEach(fieldId => {
      const windows = dayData.availability[fieldId] || [];
      result[fieldId] = windows.map(w => ({
        field: fieldId,
        start: w.start,
        end: w.end,
        type: "free",
        title: ""
      }));
    });
  }

  // Your JSON uses: dayData.events[fieldId] = [ {start, end, type, title}, ... ]
  if (dayData.events) {
    Object.keys(dayData.events).forEach(fieldId => {
      const events = dayData.events[fieldId] || [];
      if (!result[fieldId]) result[fieldId] = [];

      events.forEach(ev => {
        result[fieldId].push({
          field: fieldId,
          start: ev.start,
          end: ev.end,
          type: ev.type || "event",
          title: ev.title || "",
          team: ev.team || "",
          coach: ev.coach || "",
          grade: ev.grade || "",
          source: ev.source || ""
        });
      });
    });
  }

  return result;
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

// ---- BUILD BLOCKS FOR A SINGLE FIELD ----
function buildFieldBlocks(field, dayData) {
  const blocks = [];

  // Free windows
  field.free.forEach(win => {
    blocks.push({
      start: win.start,
      end: win.end,
      type: "free",
      title: null
    });
  });

  // Practice
  field.practice.forEach(p => {
    blocks.push({
      start: p.start,
      end: p.end,
      type: "practice",
      title: p.team
    });
  });

  // Games
  field.games.forEach(g => {
    blocks.push({
      start: g.start,
      end: g.end,
      type: "game",
      title: `${g.home} vs ${g.away}`
    });
  });

  // Admin
  field.admin.forEach(a => {
    blocks.push({
      start: a.start,
      end: a.end,
      type: "admin",
      title: a.reason
    });
  });

  return mergeSameTimeBlocks(blocks);
}

// ---- BUILD COMPLEX → BLOCKS MAP ----
function buildComplexBlocks(dayData) {
  const complexMap = buildFieldComplexMapForDay(dayData);
  const result = {};

  Object.values(complexMap).forEach(c => {
    result[c] = [];
  });

  dayData.fields.forEach(field => {
    const complex = complexMap[field.id];
    const blocks = buildFieldBlocks(field, dayData);

    blocks.forEach(b => {
      result[complex].push({
        ...b,
        fieldId: field.id,
        fieldName: field.name
      });
    });
  });

  return result;
}

// ---- BUILD DAY VIEW ----
function renderDayView(dateKey) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const dayData = AVAIL[dateKey];
  if (!dayData) {
    container.innerHTML = `<div class="no-data">No data for ${dateKey}</div>`;
    return;
  }

  const complexBlocks = buildComplexBlocks(dayData);

  // ---- HEADER ----
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = formatHumanDate(dateKey);

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // ---- FILTER BAR ----
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const complexes = Object.keys(complexBlocks);

  complexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // ---- TIMELINE ----
  const timeline = document.createElement("div");
  timeline.id = "dayTimeline";

  // Left time labels
  const times = document.createElement("div");
  times.className = "timeline-times";

  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const y = (h - START_HOUR) * 60 * PIXELS_PER_MIN;
    const lbl = document.createElement("div");
    lbl.className = "time-label";
    lbl.style.top = `${y - 6}px`;
    lbl.textContent = `${h}:00`;
    times.appendChild(lbl);

    const line = document.createElement("div");
    line.className = "time-grid-line";
    line.style.top = `${y}px`;
    times.appendChild(line);
  }

  timeline.appendChild(times);

  // ---- COMPLEX COLUMNS ----
  const complexContainer = document.createElement("div");
  complexContainer.className = "day-complexes";

  complexes.forEach(complex => {
    if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

    const col = document.createElement("div");
    col.className = "complex-column";

    const h3 = document.createElement("h3");
    h3.textContent = complex;
    col.appendChild(h3);

    const row = document.createElement("div");
    row.className = "complex-row";

    // Sunset line
    const sunsetMin = timeToMinutes(dayData.sunset);
    const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

    const sunsetLine = document.createElement("div");
    sunsetLine.className = "sunset-line";
    sunsetLine.style.top = `${sunsetY}px`;

    const sunsetLabel = document.createElement("div");
    sunsetLabel.className = "sunset-label";
    sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

    sunsetLine.appendChild(sunsetLabel);
    row.appendChild(sunsetLine);

    // Blocks
    complexBlocks[complex].forEach(b => {
      const startMin = timeToMinutes(b.start);
      const endMin = timeToMinutes(b.end);

      const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
      const height = (endMin - startMin) * PIXELS_PER_MIN;

      const div = document.createElement("div");
      div.className = `timeline-block timeline-${b.type}`;
      div.style.top = `${top}px`;
      div.style.height = `${height}px`;

      const time = document.createElement("div");
      time.className = "block-time";
      time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

      const main = document.createElement("div");
      main.className = "block-main";
      main.textContent = b.titles && b.titles.length > 0
        ? b.titles.join(", ")
        : b.fieldName;

      div.appendChild(time);
      div.appendChild(main);

      row.appendChild(div);
    });

    col.appendChild(row);
    complexContainer.appendChild(col);
  });

  timeline.appendChild(complexContainer);
  container.appendChild(timeline);
}


// ------------------------------------------------------------
// WEEK VIEW
// ------------------------------------------------------------
function renderWeekView(startDate) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const monday = getMondayOfWeek(startDate);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDateKey(d));
  }

  // ---- HEADER ----
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = `${formatShortDate(days[0])} - ${formatShortDate(days[6])}`;

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // ---- FILTER BAR ----
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const allComplexes = [
    "Holbrook HS Turf",
    "Sumner / Sean Joyce Fields",
    "Brookville Fields",
    "Avon Butler Fields"
  ];

  allComplexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // ---- WEEK TIMELINE ----
  const timeline = document.createElement("div");
  timeline.id = "weekTimeline";

  const daysContainer = document.createElement("div");
  daysContainer.className = "week-days-container";

  days.forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    const dayCol = document.createElement("div");
    dayCol.className = "week-day-column";

    const todayKey = formatDateKey(new Date());
    if (dateKey === todayKey) {
      dayCol.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "week-day-header";
    header.textContent = formatShortDate(dateKey);
    dayCol.appendChild(header);

    const dayTimeline = document.createElement("div");
    dayTimeline.className = "week-day-timeline";

    if (!dayData) {
      const noData = document.createElement("div");
      noData.className = "no-data";
      noData.textContent = "No data";
      dayTimeline.appendChild(noData);
      dayCol.appendChild(dayTimeline);
      daysContainer.appendChild(dayCol);
      return;
    }

    const complexBlocks = buildComplexBlocks(dayData);

    allComplexes.forEach(complex => {
      if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

      const col = document.createElement("div");
      col.className = "week-complex-column";
      col.dataset.loc = complex;

      const title = document.createElement("div");
      title.textContent = complex;
      col.appendChild(title);

      const sunsetMin = timeToMinutes(dayData.sunset);
      const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

      const sunsetLine = document.createElement("div");
      sunsetLine.className = "sunset-line";
      sunsetLine.style.top = `${sunsetY}px`;

      const sunsetLabel = document.createElement("div");
      sunsetLabel.className = "sunset-label";
      sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

      sunsetLine.appendChild(sunsetLabel);
      col.appendChild(sunsetLine);

      complexBlocks[complex].forEach(b => {
        const startMin = timeToMinutes(b.start);
        const endMin = timeToMinutes(b.end);

        const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
        const height = (endMin - startMin) * PIXELS_PER_MIN;

        const div = document.createElement("div");
        div.className = `timeline-block timeline-${b.type}`;
        div.style.top = `${top}px`;
        div.style.height = `${height}px`;

        const time = document.createElement("div");
        time.className = "block-time";
        time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

        const main = document.createElement("div");
        main.className = "block-main";
        main.textContent = b.titles && b.titles.length > 0
          ? b.titles.join(", ")
          : b.fieldName;

        div.appendChild(time);
        div.appendChild(main);

        col.appendChild(div);
      });

      dayTimeline.appendChild(col);
    });

    dayCol.appendChild(dayTimeline);
    daysContainer.appendChild(dayCol);
  });

  timeline.appendChild(daysContainer);
  container.appendChild(timeline);
}

// ------------------------------------------------------------
// WEEK VIEW
// ------------------------------------------------------------
function renderWeekView(startDate) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const monday = getMondayOfWeek(startDate);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDateKey(d));
  }

  // ---- HEADER ----
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = `${formatShortDate(days[0])} - ${formatShortDate(days[6])}`;

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // ---- FILTER BAR ----
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const allComplexes = [
    "Holbrook HS Turf",
    "Sumner / Sean Joyce Fields",
    "Brookville Fields",
    "Avon Butler Fields"
  ];

  allComplexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // ---- WEEK TIMELINE ----
  const timeline = document.createElement("div");
  timeline.id = "weekTimeline";

  const daysContainer = document.createElement("div");
  daysContainer.className = "week-days-container";

  days.forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    const dayCol = document.createElement("div");
    dayCol.className = "week-day-column";

    const todayKey = formatDateKey(new Date());
    if (dateKey === todayKey) {
      dayCol.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "week-day-header";
    header.textContent = formatShortDate(dateKey);
    dayCol.appendChild(header);

    const dayTimeline = document.createElement("div");
    dayTimeline.className = "week-day-timeline";

    if (!dayData) {
      const noData = document.createElement("div");
      noData.className = "no-data";
      noData.textContent = "No data";
      dayTimeline.appendChild(noData);
      dayCol.appendChild(dayTimeline);
      daysContainer.appendChild(dayCol);
      return;
    }

    const complexBlocks = buildComplexBlocks(dayData);

    allComplexes.forEach(complex => {
      if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

      const col = document.createElement("div");
      col.className = "week-complex-column";
      col.dataset.loc = complex;

      const title = document.createElement("div");
      title.textContent = complex;
      col.appendChild(title);

      const sunsetMin = timeToMinutes(dayData.sunset);
      const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

      const sunsetLine = document.createElement("div");
      sunsetLine.className = "sunset-line";
      sunsetLine.style.top = `${sunsetY}px`;

      const sunsetLabel = document.createElement("div");
      sunsetLabel.className = "sunset-label";
      sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

      sunsetLine.appendChild(sunsetLabel);
      col.appendChild(sunsetLine);

      complexBlocks[complex].forEach(b => {
        const startMin = timeToMinutes(b.start);
        const endMin = timeToMinutes(b.end);

        const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
        const height = (endMin - startMin) * PIXELS_PER_MIN;

        const div = document.createElement("div");
        div.className = `timeline-block timeline-${b.type}`;
        div.style.top = `${top}px`;
        div.style.height = `${height}px`;

        const time = document.createElement("div");
        time.className = "block-time";
        time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

        const main = document.createElement("div");
        main.className = "block-main";
        main.textContent = b.titles && b.titles.length > 0
          ? b.titles.join(", ")
          : b.fieldName;

        div.appendChild(time);
        div.appendChild(main);

        col.appendChild(div);
      });

      dayTimeline.appendChild(col);
    });

    dayCol.appendChild(dayTimeline);
    daysContainer.appendChild(dayCol);
  });

  timeline.appendChild(daysContainer);
  container.appendChild(timeline);
}


// ------------------------------------------------------------
// MONTH VIEW
// ------------------------------------------------------------
function renderMonthView(date) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // ---- HEADER ----
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = `${date.toLocaleString("en-US", { month: "long" })} ${year}`;

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // ---- GRID ----
  const grid = document.createElement("div");
  grid.className = "month-grid";

  // Create empty cells before the first day
  for (let i = 0; i < startDay; i++) {
    const cell = document.createElement("div");
    cell.className = "month-cell empty";
    grid.appendChild(cell);
  }

  // Create day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("div");
    cell.className = "month-cell";

    const dateKey = formatDateKey(new Date(year, month, d));
    const dayData = AVAIL[dateKey];

    const num = document.createElement("div");
    num.className = "month-day-number";
    num.textContent = d;
    cell.appendChild(num);

    if (dayData) {
      const hasGames = dayData.fields.some(f => f.games.length > 0);
      const hasPractice = dayData.fields.some(f => f.practice.length > 0);

      if (hasGames) {
        const tag = document.createElement("div");
        tag.className = "month-tag game-tag";
        tag.textContent = "Games";
        cell.appendChild(tag);
      }

      if (hasPractice) {
        const tag = document.createElement("div");
        tag.className = "month-tag practice-tag";
        tag.textContent = "Practice";
        cell.appendChild(tag);
      }
    }

    cell.onclick = () => {
      currentDate = new Date(year, month, d);
      VIEW_MODE = "day";
      renderCurrentView();
    };

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

// ------------------------------------------------------------
// SEARCH VIEW
// ------------------------------------------------------------
function renderSearchView() {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  header.appendChild(modeToggle);

  container.appendChild(header);

  const searchBox = document.createElement("input");
  searchBox.type = "text";
  searchBox.placeholder = "Search teams, fields, games...";
  searchBox.className = "search-box";

  const results = document.createElement("div");
  results.className = "search-results";

  searchBox.oninput = () => {
    const q = searchBox.value.toLowerCase();
    results.innerHTML = "";

    if (!q) return;

    const matches = SEARCH.filter(item =>
      item.text.toLowerCase().includes(q)
    );

    matches.forEach(m => {
      const div = document.createElement("div");
      div.className = "search-item";
      div.textContent = m.text;

      div.onclick = () => {
        currentDate = new Date(m.date);
        VIEW_MODE = "day";
        renderCurrentView();
      };

      results.appendChild(div);
    });
  };

  container.appendChild(searchBox);
  container.appendChild(results);
}


// ------------------------------------------------------------
// RENDER CURRENT VIEW
// ------------------------------------------------------------
function renderCurrentView() {
  const dateKey = formatDateKey(currentDate);

  if (VIEW_MODE === "day") {
    renderDayView(dateKey);
  } else if (VIEW_MODE === "week") {
    renderWeekView(currentDate);
  } else if (VIEW_MODE === "month") {
    renderMonthView(currentDate);
  } else if (VIEW_MODE === "search") {
    renderSearchView();
  }
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
async function initCalendar() {
  await loadSearchIndex();
  await loadAvailability();
  renderCurrentView();
}

// document.addEventListener("DOMContentLoaded", initCalendar);

// ------------------------------------------------------------
// EXTRA UTILITIES (GRID, SUNSET, BLOCKS)
// ------------------------------------------------------------

// Build horizontal grid lines for any timeline container
function buildGridLines(container) {
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const y = (h - START_HOUR) * 60 * PIXELS_PER_MIN;

    const line = document.createElement("div");
    line.className = "time-grid-line";
    line.style.top = `${y}px`;

    container.appendChild(line);
  }
}

// Build sunset line for any timeline container
function buildSunsetLine(container, sunsetTime) {
  const sunsetMin = timeToMinutes(sunsetTime);
  const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

  const sunsetLine = document.createElement("div");
  sunsetLine.className = "sunset-line";
  sunsetLine.style.top = `${sunsetY}px`;

  const sunsetLabel = document.createElement("div");
  sunsetLabel.className = "sunset-label";
  sunsetLabel.textContent = `Sunset ${to12h(sunsetTime)}`;

  sunsetLine.appendChild(sunsetLabel);
  container.appendChild(sunsetLine);
}

// Build blocks inside a timeline column
function buildBlocks(container, blocks) {
  blocks.forEach(b => {
    // Skip malformed blocks
    if (!b || !b.start || !b.end) {
      console.warn("Skipping malformed block:", b);
      return;
    }

    const startMin = timeToMinutes(b.start);
    const endMin = timeToMinutes(b.end);

    const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
    const height = (endMin - startMin) * PIXELS_PER_MIN;

    const div = document.createElement("div");
    div.className = `timeline-block timeline-${b.type}`;
    div.style.top = `${top}px`;
    div.style.height = `${height}px`;

    const time = document.createElement("div");
    time.className = "block-time";
    time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

    const main = document.createElement("div");
    main.className = "block-main";
    main.textContent = b.titles && b.titles.length > 0
      ? b.titles.join(", ")
      : b.fieldName || "";

    div.appendChild(time);
    div.appendChild(main);

    container.appendChild(div);
  });
}

// ------------------------------------------------------------
// DEBUG UTILITIES
// ------------------------------------------------------------

// Print all complexes for a given day
function debugComplexes(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }

  const complexBlocks = buildComplexBlocks(dayData);
  console.log("Complexes for", dateKey, complexBlocks);
}

// Print all blocks for a given field
function debugField(dateKey, fieldId) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }

  const field = dayData.fields.find(f => f.id === fieldId);
  if (!field) {
    console.log("Field not found:", fieldId);
    return;
  }

  const blocks = buildFieldBlocks(field, dayData);
  console.log("Blocks for field", fieldId, blocks);
}

// Print merged blocks
function debugMergedBlocks(blocks) {
  console.log("Merged blocks:", mergeSameTimeBlocks(blocks));
}


// ------------------------------------------------------------
// ADVANCED BLOCK BUILDING (MERGING FREE + USAGE)
// ------------------------------------------------------------

// Build unified blocks for rendering (free, practice, game, admin)
// ------------------------------------------------------------
// BUILD UNIFIED BLOCKS (PATCHED FOR YOUR JSON FORMAT)
// ------------------------------------------------------------
function buildUnifiedBlocks(dayData) {
  const blocks = {};

  // Step 1: Build field-level blocks using your JSON structure
  const fieldBlocks = buildDayAvailability(dayData);

  // Step 2: Normalize each field's block list
  Object.keys(fieldBlocks).forEach(fieldId => {
    const list = fieldBlocks[fieldId] || [];

    // Ensure list is always an array
    if (!Array.isArray(list)) {
      blocks[fieldId] = [];
      return;
    }

    // Normalize block objects
    blocks[fieldId] = list.map(b => ({
      field: fieldId,
      start: b.start,
      end: b.end,
      type: b.type || "free",
      title: b.title || "",
      team: b.team || "",
      coach: b.coach || "",
      grade: b.grade || "",
      source: b.source || ""
    }));
  });

  return blocks;
}


// ------------------------------------------------------------
// BUILD UNIFIED COMPLEX BLOCKS (PATCHED FOR YOUR JSON FORMAT)
// ------------------------------------------------------------
function buildUnifiedComplexBlocks(dayData, allComplexes) {
  const unified = {};
  const blocks = buildUnifiedBlocks(dayData);

  // Build complex groups
  const complexMap = buildFieldComplexMapForDay(dayData);
  console.log("complexMap:", complexMap);

  
  // ALWAYS initialize every complex column
  allComplexes.forEach(complex => {
    unified[complex] = [];
  });

  // Iterate over each field's block list
  Object.keys(blocks).forEach(fieldId => {
    const fieldBlockList = blocks[fieldId];
    if (!Array.isArray(fieldBlockList)) return;

    const complex = complexMap[fieldId] || "unknown";

    fieldBlockList.forEach(block => {
      if (!block || !block.start || !block.end) {
        console.warn("Skipping malformed block:", block);
        return;
      }

      unified[complex].push({
        fieldId: fieldId,
        start: block.start,
        end: block.end,
        type: block.type,
        title: block.title || "",
        team: block.team || "",
        coach: block.coach || "",
        grade: block.grade || "",
        source: block.source || ""
      });
    });
  });

  return unified;
}




// ------------------------------------------------------------
// WEEK VIEW (ADVANCED VERSION USING UNIFIED BLOCKS)
// ------------------------------------------------------------
function renderWeekViewUnified(startDate) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const monday = getMondayOfWeek(startDate);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDateKey(d));
  }

  // Header
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = `${formatShortDate(days[0])} - ${formatShortDate(days[6])}`;

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const allComplexes = [
    "Holbrook HS Turf",
    "Sumner / Sean Joyce Fields",
    "Brookville Fields",
    "Avon Butler Fields"
  ];

  allComplexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // Timeline
  const timeline = document.createElement("div");
  timeline.id = "weekTimeline";

  const daysContainer = document.createElement("div");
  daysContainer.className = "week-days-container";

  days.forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    const dayCol = document.createElement("div");
    dayCol.className = "week-day-column";

    const todayKey = formatDateKey(new Date());
    if (dateKey === todayKey) {
      dayCol.classList.add("today");
    }

    const header = document.createElement("div");
    header.className = "week-day-header";
    header.textContent = formatShortDate(dateKey);
    dayCol.appendChild(header);

    const dayTimeline = document.createElement("div");
    dayTimeline.className = "week-day-timeline";

    if (!dayData) {
      const noData = document.createElement("div");
      noData.className = "no-data";
      noData.textContent = "No data";
      dayTimeline.appendChild(noData);
      dayCol.appendChild(dayTimeline);
      daysContainer.appendChild(dayCol);
      return;
    }

    const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);

    allComplexes.forEach(complex => {
      if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

      const col = document.createElement("div");
      col.className = "week-complex-column";
      col.dataset.loc = complex;

      const title = document.createElement("div");
      title.textContent = complex;
      col.appendChild(title);

      // Sunset
      const sunsetMin = timeToMinutes(dayData.sunset);
      const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

      const sunsetLine = document.createElement("div");
      sunsetLine.className = "sunset-line";
      sunsetLine.style.top = `${sunsetY}px`;

      const sunsetLabel = document.createElement("div");
      sunsetLabel.className = "sunset-label";
      sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

      sunsetLine.appendChild(sunsetLabel);
      col.appendChild(sunsetLine);

      // Blocks
      const list = complexBlocks[complex];
      
      // Skip missing or malformed arrays
      if (!list || !Array.isArray(list)) {
        console.warn("Skipping malformed complex block array:", complex, list);
        return;
      }
      
      list.forEach(b => {
        // Skip malformed blocks
        if (!b || !b.start || !b.end) {
          console.warn("Skipping malformed block:", b);
          return;
        }
      
        const startMin = timeToMinutes(b.start);
        const endMin = timeToMinutes(b.end);
      
        const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
        const height = (endMin - startMin) * PIXELS_PER_MIN;
      
        const div = document.createElement("div");
        div.className = `timeline-block timeline-${b.type}`;
        div.style.top = `${top}px`;
        div.style.height = `${height}px`;
      
        const time = document.createElement("div");
        time.className = "block-time";
        time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;
      
        const main = document.createElement("div");
        main.className = "block-main";
        main.textContent = b.title || b.fieldName || "";
      
        div.appendChild(time);
        div.appendChild(main);
      
        col.appendChild(div);
      });


      dayTimeline.appendChild(col);
    });

    dayCol.appendChild(dayTimeline);
    daysContainer.appendChild(dayCol);
  });

  timeline.appendChild(daysContainer);
  container.appendChild(timeline);
}

// ------------------------------------------------------------
// DAY VIEW (ADVANCED VERSION USING UNIFIED BLOCKS)
// ------------------------------------------------------------
function renderDayViewUnified(dateKey) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const dayData = AVAIL[dateKey];
  if (!dayData) {
    container.innerHTML = `<div class="no-data">No data for ${dateKey}</div>`;
    return;
  }

  const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);

  // Header
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = formatHumanDate(dateKey);

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const complexes = Object.keys(complexBlocks);

  complexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // Timeline
  const timeline = document.createElement("div");
  timeline.id = "dayTimeline";

  const times = document.createElement("div");
  times.className = "timeline-times";

  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const y = (h - START_HOUR) * 60 * PIXELS_PER_MIN;

    const lbl = document.createElement("div");
    lbl.className = "time-label";
    lbl.style.top = `${y - 6}px`;
    lbl.textContent = `${h}:00`;
    times.appendChild(lbl);

    const line = document.createElement("div");
    line.className = "time-grid-line";
    line.style.top = `${y}px`;
    times.appendChild(line);
  }

  timeline.appendChild(times);

  const complexContainer = document.createElement("div");
  complexContainer.className = "day-complexes";

  complexes.forEach(complex => {
    if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

    const col = document.createElement("div");
    col.className = "complex-column";

    const h3 = document.createElement("h3");
    h3.textContent = complex;
    col.appendChild(h3);

    const row = document.createElement("div");
    row.className = "complex-row";

    const sunsetMin = timeToMinutes(dayData.sunset);
    const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

    const sunsetLine = document.createElement("div");
    sunsetLine.className = "sunset-line";
    sunsetLine.style.top = `${sunsetY}px`;

    const sunsetLabel = document.createElement("div");
    sunsetLabel.className = "sunset-label";
    sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

    sunsetLine.appendChild(sunsetLabel);
    row.appendChild(sunsetLine);

    complexBlocks[complex].forEach(b => {
      const startMin = timeToMinutes(b.start);
      const endMin = timeToMinutes(b.end);

      const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
      const height = (endMin - startMin) * PIXELS_PER_MIN;

      const div = document.createElement("div");
      div.className = `timeline-block timeline-${b.type}`;
      div.style.top = `${top}px`;
      div.style.height = `${height}px`;

      const time = document.createElement("div");
      time.className = "block-time";
      time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

      const main = document.createElement("div");
      main.className = "block-main";
      main.textContent = b.title || b.fieldName;

      div.appendChild(time);
      div.appendChild(main);

      row.appendChild(div);
    });

    col.appendChild(row);
    complexContainer.appendChild(col);
  });

  timeline.appendChild(complexContainer);
  container.appendChild(timeline);
}


// ------------------------------------------------------------
// DAY VIEW (ADVANCED VERSION USING UNIFIED BLOCKS)
// ------------------------------------------------------------
function renderDayViewUnified(dateKey) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const dayData = AVAIL[dateKey];
  if (!dayData) {
    container.innerHTML = `<div class="no-data">No data for ${dateKey}</div>`;
    return;
  }

  const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);

  // Header
  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  const controls = document.createElement("div");
  controls.className = "controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn";
  prevBtn.textContent = "<";
  prevBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    renderCurrentView();
  };

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn";
  nextBtn.textContent = ">";
  nextBtn.onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    renderCurrentView();
  };

  const label = document.createElement("div");
  label.className = "period-label";
  label.textContent = formatHumanDate(dateKey);

  controls.appendChild(prevBtn);
  controls.appendChild(label);
  controls.appendChild(nextBtn);

  header.appendChild(modeToggle);
  header.appendChild(controls);

  container.appendChild(header);

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";

  const filterGroup = document.createElement("div");
  filterGroup.className = "filter-button-group";

  const complexes = Object.keys(complexBlocks);

  complexes.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (FILTER_COMPLEXES.has(c) ? " active" : "");
    btn.textContent = c;

    btn.onclick = () => {
      if (FILTER_COMPLEXES.has(c)) {
        FILTER_COMPLEXES.delete(c);
      } else {
        FILTER_COMPLEXES.add(c);
      }
      renderCurrentView();
    };

    filterGroup.appendChild(btn);
  });

  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // Timeline
  const timeline = document.createElement("div");
  timeline.id = "dayTimeline";

  const times = document.createElement("div");
  times.className = "timeline-times";

  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const y = (h - START_HOUR) * 60 * PIXELS_PER_MIN;

    const lbl = document.createElement("div");
    lbl.className = "time-label";
    lbl.style.top = `${y - 6}px`;
    lbl.textContent = `${h}:00`;
    times.appendChild(lbl);

    const line = document.createElement("div");
    line.className = "time-grid-line";
    line.style.top = `${y}px`;
    times.appendChild(line);
  }

  timeline.appendChild(times);

  const complexContainer = document.createElement("div");
  complexContainer.className = "day-complexes";

  complexes.forEach(complex => {
    if (FILTER_COMPLEXES.size > 0 && !FILTER_COMPLEXES.has(complex)) return;

    const col = document.createElement("div");
    col.className = "complex-column";

    const h3 = document.createElement("h3");
    h3.textContent = complex;
    col.appendChild(h3);

    const row = document.createElement("div");
    row.className = "complex-row";

    const sunsetMin = timeToMinutes(dayData.sunset);
    const sunsetY = (sunsetMin - START_HOUR * 60) * PIXELS_PER_MIN;

    const sunsetLine = document.createElement("div");
    sunsetLine.className = "sunset-line";
    sunsetLine.style.top = `${sunsetY}px`;

    const sunsetLabel = document.createElement("div");
    sunsetLabel.className = "sunset-label";
    sunsetLabel.textContent = `Sunset ${to12h(dayData.sunset)}`;

    sunsetLine.appendChild(sunsetLabel);
    row.appendChild(sunsetLine);

    complexBlocks[complex].forEach(b => {
      const startMin = timeToMinutes(b.start);
      const endMin = timeToMinutes(b.end);

      const top = (startMin - START_HOUR * 60) * PIXELS_PER_MIN;
      const height = (endMin - startMin) * PIXELS_PER_MIN;

      const div = document.createElement("div");
      div.className = `timeline-block timeline-${b.type}`;
      div.style.top = `${top}px`;
      div.style.height = `${height}px`;

      const time = document.createElement("div");
      time.className = "block-time";
      time.textContent = `${to12h(b.start)} - ${to12h(b.end)}`;

      const main = document.createElement("div");
      main.className = "block-main";
      main.textContent = b.title || b.fieldName;

      div.appendChild(time);
      div.appendChild(main);

      row.appendChild(div);
    });

    col.appendChild(row);
    complexContainer.appendChild(col);
  });

  timeline.appendChild(complexContainer);
  container.appendChild(timeline);
}


// ------------------------------------------------------------
// MASTER RENDER SWITCH (UNIFIED VERSION)
// ------------------------------------------------------------
function renderCurrentViewUnified() {
  const dateKey = formatDateKey(currentDate);

  if (VIEW_MODE === "day") {
    renderDayViewUnified(dateKey);
  } else if (VIEW_MODE === "week") {
    renderWeekViewUnified(currentDate);
  } else if (VIEW_MODE === "month") {
    renderMonthViewUnified(currentDate);
  } else if (VIEW_MODE === "search") {
    renderSearchViewUnified();
  }
}

// ------------------------------------------------------------
// INIT (UNIFIED VERSION)
// ------------------------------------------------------------
async function initCalendarUnified() {
  await loadSearchIndex();
  await loadAvailability();
  renderCurrentViewUnified();
}

// If you want unified mode as default, uncomment:
// document.addEventListener("DOMContentLoaded", initCalendarUnified);

// ------------------------------------------------------------
// FIELD SUMMARY UTILITIES
// ------------------------------------------------------------

// Summaries for quick debugging or UI enhancements
function summarizeField(field) {
  return {
    id: field.id,
    name: field.name,
    free: field.free.length,
    practice: field.practice.length,
    games: field.games.length,
    admin: field.admin.length
  };
}

function summarizeDay(dayData) {
  return dayData.fields.map(f => summarizeField(f));
}

function debugDaySummary(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }
  console.log("Summary for", dateKey, summarizeDay(dayData));
}

// ------------------------------------------------------------
// COMPLEX SUMMARY UTILITIES
// ------------------------------------------------------------
function summarizeComplexBlocks(complexBlocks) {
  const summary = {};

  Object.keys(complexBlocks).forEach(complex => {
    const blocks = complexBlocks[complex];

    summary[complex] = {
      free: blocks.filter(b => b.type === "free").length,
      practice: blocks.filter(b => b.type === "practice").length,
      games: blocks.filter(b => b.type === "game").length,
      admin: blocks.filter(b => b.type === "admin").length
    };
  });

  return summary;
}

function debugComplexSummary(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }

  const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);
  console.log("Complex summary for", dateKey, summarizeComplexBlocks(complexBlocks));
}

// ------------------------------------------------------------
// ADVANCED SEARCH UTILITIES
// ------------------------------------------------------------

// Search for games by team name
function searchGamesByTeam(teamName) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.games.forEach(g => {
        if (
          g.home.toLowerCase().includes(teamName.toLowerCase()) ||
          g.away.toLowerCase().includes(teamName.toLowerCase())
        ) {
          results.push({
            date: dateKey,
            field: field.name,
            home: g.home,
            away: g.away,
            start: g.start,
            end: g.end
          });
        }
      });
    });
  });

  return results;
}

// Search for practice by team name
function searchPracticeByTeam(teamName) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.practice.forEach(p => {
        if (p.team.toLowerCase().includes(teamName.toLowerCase())) {
          results.push({
            date: dateKey,
            field: field.name,
            team: p.team,
            start: p.start,
            end: p.end
          });
        }
      });
    });
  });

  return results;
}

// Search for admin blocks by reason
function searchAdminByReason(reason) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.admin.forEach(a => {
        if (a.reason.toLowerCase().includes(reason.toLowerCase())) {
          results.push({
            date: dateKey,
            field: field.name,
            reason: a.reason,
            start: a.start,
            end: a.end
          });
        }
      });
    });
  });

  return results;
}


// ------------------------------------------------------------
// MASTER RENDER SWITCH (UNIFIED VERSION)
// ------------------------------------------------------------
function renderCurrentViewUnified() {
  const dateKey = formatDateKey(currentDate);

  if (VIEW_MODE === "day") {
    renderDayViewUnified(dateKey);
  } else if (VIEW_MODE === "week") {
    renderWeekViewUnified(currentDate);
  } else if (VIEW_MODE === "month") {
    renderMonthViewUnified(currentDate);
  } else if (VIEW_MODE === "search") {
    renderSearchViewUnified();
  }
}

// ------------------------------------------------------------
// INIT (UNIFIED VERSION)
// ------------------------------------------------------------
async function initCalendarUnified() {
  await loadSearchIndex();
  await loadAvailability();
  renderCurrentViewUnified();
}

// If you want unified mode as default, uncomment:
// document.addEventListener("DOMContentLoaded", initCalendarUnified);

// ------------------------------------------------------------
// FIELD SUMMARY UTILITIES
// ------------------------------------------------------------

// Summaries for quick debugging or UI enhancements
function summarizeField(field) {
  return {
    id: field.id,
    name: field.name,
    free: field.free.length,
    practice: field.practice.length,
    games: field.games.length,
    admin: field.admin.length
  };
}

function summarizeDay(dayData) {
  return dayData.fields.map(f => summarizeField(f));
}

function debugDaySummary(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }
  console.log("Summary for", dateKey, summarizeDay(dayData));
}

// ------------------------------------------------------------
// COMPLEX SUMMARY UTILITIES
// ------------------------------------------------------------
function summarizeComplexBlocks(complexBlocks) {
  const summary = {};

  Object.keys(complexBlocks).forEach(complex => {
    const blocks = complexBlocks[complex];

    summary[complex] = {
      free: blocks.filter(b => b.type === "free").length,
      practice: blocks.filter(b => b.type === "practice").length,
      games: blocks.filter(b => b.type === "game").length,
      admin: blocks.filter(b => b.type === "admin").length
    };
  });

  return summary;
}

function debugComplexSummary(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }

  const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);
  console.log("Complex summary for", dateKey, summarizeComplexBlocks(complexBlocks));
}

// ------------------------------------------------------------
// ADVANCED SEARCH UTILITIES
// ------------------------------------------------------------

// Search for games by team name
function searchGamesByTeam(teamName) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.games.forEach(g => {
        if (
          g.home.toLowerCase().includes(teamName.toLowerCase()) ||
          g.away.toLowerCase().includes(teamName.toLowerCase())
        ) {
          results.push({
            date: dateKey,
            field: field.name,
            home: g.home,
            away: g.away,
            start: g.start,
            end: g.end
          });
        }
      });
    });
  });

  return results;
}

// Search for practice by team name
function searchPracticeByTeam(teamName) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.practice.forEach(p => {
        if (p.team.toLowerCase().includes(teamName.toLowerCase())) {
          results.push({
            date: dateKey,
            field: field.name,
            team: p.team,
            start: p.start,
            end: p.end
          });
        }
      });
    });
  });

  return results;
}

// Search for admin blocks by reason
function searchAdminByReason(reason) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      field.admin.forEach(a => {
        if (a.reason.toLowerCase().includes(reason.toLowerCase())) {
          results.push({
            date: dateKey,
            field: field.name,
            reason: a.reason,
            start: a.start,
            end: a.end
          });
        }
      });
    });
  });

  return results;
}


// ------------------------------------------------------------
// ADVANCED TEAM SEARCH (UNIFIED)
// ------------------------------------------------------------

// Search all blocks (free, practice, game, admin) for a team
function searchTeamAll(teamName) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];
    const complexBlocks = buildUnifiedComplexBlocks(dayData, allComplexes);

    Object.keys(complexBlocks).forEach(complex => {
      complexBlocks[complex].forEach(b => {
        if (
          (b.title && b.title.toLowerCase().includes(teamName.toLowerCase())) ||
          (b.fieldName && b.fieldName.toLowerCase().includes(teamName.toLowerCase()))
        ) {
          results.push({
            date: dateKey,
            complex,
            field: b.fieldName,
            type: b.type,
            title: b.title,
            start: b.start,
            end: b.end
          });
        }
      });
    });
  });

  return results;
}

// Search for fields by name
function searchFieldsByName(name) {
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];

    dayData.fields.forEach(field => {
      if (field.name.toLowerCase().includes(name.toLowerCase())) {
        results.push({
          date: dateKey,
          field: field.name,
          id: field.id
        });
      }
    });
  });

  return results;
}

// Search for availability windows by time
function searchAvailabilityByTime(timeHM) {
  const targetMin = hmToMin(timeHM);
  const results = [];

  Object.keys(AVAIL).forEach(dateKey => {
    const dayData = AVAIL[dateKey];
    const dayAvail = buildDayAvailability(dayData);

    dayData.fields.forEach(field => {
      const avail = dayAvail[field.id];

      avail.free.forEach(win => {
        const s = hmToMin(win.start);
        const e = hmToMin(win.end);

        if (targetMin >= s && targetMin <= e) {
          results.push({
            date: dateKey,
            field: field.name,
            start: win.start,
            end: win.end
          });
        }
      });
    });
  });

  return results;
}

// ------------------------------------------------------------
// GLOBAL SEARCH DISPATCHER
// ------------------------------------------------------------
function globalSearch(query) {
  const q = query.toLowerCase();

  const results = [];

  // Team search
  const teamMatches = searchTeamAll(q);
  results.push(...teamMatches.map(r => ({
    type: "team",
    ...r
  })));

  // Field search
  const fieldMatches = searchFieldsByName(q);
  results.push(...fieldMatches.map(r => ({
    type: "field",
    ...r
  })));

  // Time search (HH:MM)
  if (/^\d{1,2}:\d{2}$/.test(q)) {
    const timeMatches = searchAvailabilityByTime(q);
    results.push(...timeMatches.map(r => ({
      type: "time",
      ...r
    })));
  }

  return results;
}

// ------------------------------------------------------------
// SEARCH VIEW (GLOBAL SEARCH VERSION)
// ------------------------------------------------------------
function renderSearchViewGlobal() {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "view-header";

  const modeToggle = document.createElement("div");
  modeToggle.className = "view-mode-toggle";

  ["day", "week", "month", "search"].forEach(mode => {
    const btn = document.createElement("button");
    btn.className = "mode-btn" + (VIEW_MODE === mode ? " active" : "");
    btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.onclick = () => {
      VIEW_MODE = mode;
      renderCurrentView();
    };
    modeToggle.appendChild(btn);
  });

  header.appendChild(modeToggle);
  container.appendChild(header);

  const searchBox = document.createElement("input");
  searchBox.type = "text";
  searchBox.placeholder = "Search teams, fields, games, times...";
  searchBox.className = "search-box";

  const results = document.createElement("div");
  results.className = "search-results";

  searchBox.oninput = () => {
    const q = searchBox.value;
    results.innerHTML = "";

    if (!q) return;

    const matches = globalSearch(q);

    matches.forEach(m => {
      const div = document.createElement("div");
      div.className = "search-item";

      let label = "";

      if (m.type === "team") {
        label = `[Team] ${m.title || m.field} — ${m.date} ${m.start}-${m.end}`;
      } else if (m.type === "field") {
        label = `[Field] ${m.field} — ${m.date}`;
      } else if (m.type === "time") {
        label = `[Available] ${m.field} — ${m.date} ${m.start}-${m.end}`;
      }

      div.textContent = label;

      div.onclick = () => {
        currentDate = new Date(m.date);
        VIEW_MODE = "day";
        renderCurrentView();
      };

      results.appendChild(div);
    });
  };

  container.appendChild(searchBox);
  container.appendChild(results);
}


// ------------------------------------------------------------
// EXPORT UTILITIES (OPTIONAL)
// ------------------------------------------------------------

// Export daily availability as JSON
function exportDayJSON(dateKey) {
  const dayData = AVAIL[dateKey];
  if (!dayData) {
    console.log("No data for", dateKey);
    return;
  }

  const unified = buildUnifiedComplexBlocks(dayData);
  const json = JSON.stringify(unified, null, 2);

  console.log("Export for", dateKey, json);
  return json;
}

// Export weekly availability as JSON
function exportWeekJSON(startDate) {
  const monday = getMondayOfWeek(startDate);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDateKey(d));
  }

  const result = {};

  days.forEach(dateKey => {
    const dayData = AVAIL[dateKey];
    if (!dayData) return;

    result[dateKey] = buildUnifiedComplexBlocks(dayData);
  });

  const json = JSON.stringify(result, null, 2);
  console.log("Weekly export:", json);
  return json;
}

// Export monthly availability as JSON
function exportMonthJSON(date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(new Date(year, month, d));
    const dayData = AVAIL[dateKey];
    if (!dayData) continue;

    result[dateKey] = buildUnifiedComplexBlocks(dayData);
  }

  const json = JSON.stringify(result, null, 2);
  console.log("Monthly export:", json);
  return json;
}

// ------------------------------------------------------------
// UI HELPERS
// ------------------------------------------------------------

// Smooth scroll to top
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Highlight today's date in month view
function highlightTodayInMonth() {
  const todayKey = formatDateKey(new Date());
  const cells = document.querySelectorAll(".month-cell");

  cells.forEach(cell => {
    const num = cell.querySelector(".month-day-number");
    if (!num) return;

    const d = Number(num.textContent);
    const cellDate = formatDateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), d));

    if (cellDate === todayKey) {
      cell.classList.add("today");
    }
  });
}

// Highlight current time in day/week view
function highlightCurrentTime() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  const y = (min - START_HOUR * 60) * PIXELS_PER_MIN;

  const line = document.createElement("div");
  line.className = "current-time-line";
  line.style.top = `${y}px`;

  const timelines = document.querySelectorAll(".complex-row, .week-complex-column");
  timelines.forEach(t => t.appendChild(line.cloneNode(true)));
}

// ------------------------------------------------------------
// LIVE REFRESH (OPTIONAL)
// ------------------------------------------------------------

// Auto-refresh every X minutes
let autoRefreshInterval = null;

function startAutoRefresh(minutes = 5) {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);

  autoRefreshInterval = setInterval(async () => {
    await loadAvailability();
    renderCurrentView();
  }, minutes * 60 * 1000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ------------------------------------------------------------
// ADVANCED DEBUGGING PANEL
// ------------------------------------------------------------

function renderDebugPanel() {
  const panel = document.createElement("div");
  panel.id = "debugPanel";

  panel.innerHTML = `
    <h3>Debug Tools</h3>
    <button id="dbg-summary">Day Summary</button>
    <button id="dbg-complex">Complex Summary</button>
    <button id="dbg-field">Field Blocks</button>
    <button id="dbg-avail">Field Availability</button>
    <button id="dbg-export-day">Export Day JSON</button>
    <button id="dbg-export-week">Export Week JSON</button>
    <button id="dbg-export-month">Export Month JSON</button>
  `;

  document.body.appendChild(panel);

  document.getElementById("dbg-summary").onclick = () => {
    const dk = formatDateKey(currentDate);
    debugDaySummary(dk);
  };

  document.getElementById("dbg-complex").onclick = () => {
    const dk = formatDateKey(currentDate);
    debugComplexSummary(dk);
  };

  document.getElementById("dbg-field").onclick = () => {
    const dk = formatDateKey(currentDate);
    const id = prompt("Field ID?");
    debugField(dk, id);
  };

  document.getElementById("dbg-avail").onclick = () => {
    const dk = formatDateKey(currentDate);
    const id = prompt("Field ID?");
    debugFieldAvailability(dk, id);
  };

  document.getElementById("dbg-export-day").onclick = () => {
    const dk = formatDateKey(currentDate);
    exportDayJSON(dk);
  };

  document.getElementById("dbg-export-week").onclick = () => {
    exportWeekJSON(currentDate);
  };

  document.getElementById("dbg-export-month").onclick = () => {
    exportMonthJSON(currentDate);
  };
}


// ------------------------------------------------------------
// INLINE HELP OVERLAY (OPTIONAL)
// ------------------------------------------------------------
function renderHelpOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "helpOverlay";

  overlay.innerHTML = `
    <div class="help-content">
      <h2>Calendar Help</h2>
      <p>This scheduling tool shows:</p>
      <ul>
        <li>Field availability</li>
        <li>Practices</li>
        <li>Games</li>
        <li>Admin blocks</li>
        <li>Sunset times</li>
      </ul>
      <p>You can switch between Day, Week, Month, and Search views.</p>
      <button id="helpClose">Close</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("helpClose").onclick = () => {
    overlay.remove();
  };
}

// ------------------------------------------------------------
// KEYBOARD SHORTCUTS (OPTIONAL)
// ------------------------------------------------------------
function enableKeyboardShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") {
      if (VIEW_MODE === "day") currentDate.setDate(currentDate.getDate() - 1);
      if (VIEW_MODE === "week") currentDate.setDate(currentDate.getDate() - 7);
      if (VIEW_MODE === "month") currentDate.setMonth(currentDate.getMonth() - 1);
      renderCurrentView();
    }

    if (e.key === "ArrowRight") {
      if (VIEW_MODE === "day") currentDate.setDate(currentDate.getDate() + 1);
      if (VIEW_MODE === "week") currentDate.setDate(currentDate.getDate() + 7);
      if (VIEW_MODE === "month") currentDate.setMonth(currentDate.getMonth() + 1);
      renderCurrentView();
    }

    if (e.key === "t") {
      currentDate = new Date();
      renderCurrentView();
    }

    if (e.key === "?") {
      renderHelpOverlay();
    }
  });
}

// ------------------------------------------------------------
// STYLE INJECTION (OPTIONAL)
// ------------------------------------------------------------
function injectDynamicStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #helpOverlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    .help-content {
      background: white;
      padding: 20px;
      border-radius: 10px;
      width: 400px;
      text-align: center;
    }
    .current-time-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: red;
      z-index: 10;
    }
  `;
  document.head.appendChild(style);
}

// ------------------------------------------------------------
// FINAL INIT HOOKS
// ------------------------------------------------------------
function enableAllEnhancements() {
  enableKeyboardShortcuts();
  injectDynamicStyles();
  renderDebugPanel();
}

// ------------------------------------------------------------
// INITIALIZE THE UNIFIED CALENDAR ENGINE
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initCalendarUnified();
  enableAllEnhancements();
});
