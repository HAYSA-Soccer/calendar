let SEARCH = null;

async function loadSearchIndex() {
  const resp = await fetch("data/search_index.json");
  SEARCH = await resp.json();
  console.warn("SEARCH:", SEARCH);
}


let AVAIL = null;

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

// ---- GLOBAL STATE ----
let currentDate = new Date();

// ---- TIMELINE RENDER ----
function renderTimeline() {
  const tl = document.getElementById("dayTimeline");
  const dateKey = formatDateKey(currentDate);

  tl.innerHTML = `
    <p>Timeline for ${formatHumanDate(dateKey)}</p>
  `;

  // If no availability for this date
  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    tl.innerHTML += `<p>No availability for this date.</p>`;
    return;
  }

  const dayFields = AVAIL.days[dateKey].fields;

  // Render each field
  dayFields.forEach(field => {
    tl.innerHTML += `
      <div class="timeline-block" style="
        margin-top: 20px;
        padding: 10px;
        background: #c8f7c5;
        border: 1px solid #7ac27a;
        border-radius: 6px;
        font-size: 14px;
      ">
        <strong>${field.surface}</strong><br>
        Field ID: ${field.id}<br>
        Complex: ${field.complex}
      </div>
    `;
  });

  // Now add time windows from search_index
  if (SEARCH && SEARCH[dateKey]) {
    const fullWindows = SEARCH[dateKey].full || [];
    const halfWindows = SEARCH[dateKey].half || [];

    fullWindows.forEach(win => {
      tl.innerHTML += `
        <div class="timeline-block" style="
          margin-top: 20px;
          padding: 10px;
          background: #d0e8ff;
          border: 1px solid #5aa0e0;
          border-radius: 6px;
          font-size: 14px;
        ">
          <strong>Full Field Window</strong><br>
          ${win.start_12} – ${win.end_12}<br>
          Fields: ${win.fields.join(", ")}
        </div>
      `;
    });

    halfWindows.forEach(win => {
      tl.innerHTML += `
        <div class="timeline-block" style="
          margin-top: 20px;
          padding: 10px;
          background: #ffe5b4;
          border: 1px solid #e0a85a;
          border-radius: 6px;
          font-size: 14px;
        ">
          <strong>Half Field Window</strong><br>
          ${win.start_12} – ${win.end_12}<br>
          Fields: ${win.fields.join(", ")}
        </div>
      `;
    });
  }
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

  // ---- BUTTON HANDLERS ----
  document.getElementById("prevDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    render();
  };

  document.getElementById("nextDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    render();
  };

  // ---- UPDATE TIMELINE ----
  renderTimeline();
}
