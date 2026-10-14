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
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  const dateKey = formatDateKey(currentDate);

  tl.innerHTML = `
    <p>Timeline for ${formatHumanDate(dateKey)}</p>
  `;

  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    tl.innerHTML += `<p>No availability for this date.</p>`;
    return;
  }

  const dayData = AVAIL.days[dateKey];
  const fields = dayData.fields;
  const merged = dayData.merged || [];

  // ---- Build FIELD_MAP from JSON ----
  const FIELD_MAP = {};
  fields.forEach(f => {
    FIELD_MAP[f.id] = {
      id: f.id,
      parent: f.name,     // THIS IS THE TRUE parent_field
      type: f.complex,    // "full" or "half"
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

  // ---- Sort blocks by start time ----
  Object.keys(byField).forEach(fid => {
    byField[fid].sort((a, b) => a.start.localeCompare(b.start));
  });

  // ---- Render each field ----
  fields.forEach(field => {
    const fid = field.id;
    const parent = FIELD_MAP[fid].parent;
    const type = FIELD_MAP[fid].type;

    tl.innerHTML += `
      <div class="timeline-field" style="
        margin-top: 25px;
        padding: 10px;
        background: #e8ffe8;
        border: 1px solid #7ac27a;
        border-radius: 6px;
      ">
        <strong>${field.surface}</strong><br>
        Field ID: ${fid}<br>
        Type: ${type}
      </div>
    `;

    // ---- FULL FIELD LOGIC ----
    if (type === "full") {
      const fullAvail = dayData.availability[fid] || [];

      // Find half fields using parent_field relationship
      const halfFields = fields.filter(f => f.name === fid && f.complex === "half");

      const halfUsage = [];

      halfFields.forEach(h => {
        const events = dayData.events[h.id] || [];
        events.forEach(ev => {
          halfUsage.push({ start: ev.start, end: ev.end });
        });
      });

      // Compute true availability
      const trueAvail = subtractUsage(fullAvail, halfUsage);

      trueAvail.forEach(win => {
        tl.innerHTML += `
          <div class="timeline-block" style="
            margin: 10px 0 10px 20px;
            padding: 10px;
            background: #d0e8ff;
            border: 1px solid #999;
            border-radius: 6px;
          ">
            <strong>FREE</strong><br>
            ${to12h(win.start)} – ${to12h(win.end)}
          </div>
        `;
      });
    }

    // ---- HALF FIELD LOGIC ----
    if (type === "half") {
      const blocks = byField[fid] || [];

      blocks.forEach(block => {
        const color =
          block.type === "free" ? "#d0e8ff" :
          block.type === "practice" ? "#ffe5b4" :
          "#f0f0f0";

        tl.innerHTML += `
          <div class="timeline-block" style="
            margin: 10px 0 10px 20px;
            padding: 10px;
            background: ${color};
            border: 1px solid #999;
            border-radius: 6px;
            font-size: 14px;
          ">
            <strong>${block.type.toUpperCase()}</strong><br>
            ${block.start_12} – ${block.end_12}<br>
            ${block.title ? `Title: ${block.title}<br>` : ""}
          </div>
        `;
      });
    }
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
