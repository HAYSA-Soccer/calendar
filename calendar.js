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

// ---- GLOBAL STATE ----
let currentDate = new Date();

// ---- TIMELINE RENDER ----
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
  const merged = dayData.merged || [];

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

  // ---- Group merged blocks by field ----
  const byField = {};
  merged.forEach(block => {
    if (!byField[block.field]) byField[block.field] = [];
    byField[block.field].push(block);
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

    // Field label
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = `${field.surface} (${type})`;
    row.appendChild(label);

    // FULL FIELD LOGIC
    if (type === "full") {
      const fullAvail = dayData.availability[fid] || [];

      const halfFields = fields.filter(f => f.name === fid && f.complex === "half");

      const halfUsage = [];
      halfFields.forEach(h => {
        const events = dayData.events[h.id] || [];
        events.forEach(ev => {
          halfUsage.push({ start: ev.start, end: ev.end });
        });
      });

      const trueAvail = subtractUsage(fullAvail, halfUsage);

      trueAvail.forEach(win => {
        const block = document.createElement("div");
        block.className = "timeline-block";
        block.style.background = "#d0e8ff";

        const startMin = timeToMinutes(win.start) - START_HOUR * 60;
        const endMin = timeToMinutes(win.end) - START_HOUR * 60;

        block.style.top = `${startMin * PIXELS_PER_MIN}px`;
        block.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;

        block.innerHTML = `
          <strong>FREE</strong><br>
          ${to12h(win.start)} – ${to12h(win.end)}
        `;

        row.appendChild(block);
      });
    }

    // HALF FIELD LOGIC
    if (type === "half") {
      const blocks = byField[fid] || [];

      blocks.forEach(blockData => {
        const block = document.createElement("div");
        block.className = "timeline-block";

        const color =
          blockData.type === "free" ? "#d0e8ff" :
          blockData.type === "practice" ? "#ffe5b4" :
          "#f0f0f0";

        block.style.background = color;

        const startMin = timeToMinutes(blockData.start) - START_HOUR * 60;
        const endMin = timeToMinutes(blockData.end) - START_HOUR * 60;

        block.style.top = `${startMin * PIXELS_PER_MIN}px`;
        block.style.height = `${(endMin - startMin) * PIXELS_PER_MIN}px`;

        block.innerHTML = `
          <strong>${blockData.type.toUpperCase()}</strong><br>
          ${blockData.start_12} – ${blockData.end_12}<br>
          ${blockData.title ? `Title: ${blockData.title}` : ""}
        `;

        row.appendChild(block);
      });
    }

    fieldCol.appendChild(row);
  });
}

// ---- Convert HH:MM to minutes ----
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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
