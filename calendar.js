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

  // Timeline header
  tl.innerHTML = `
    <p>Timeline for ${formatHumanDate(dateKey)}</p>
  `;

  // If no data for this date
  if (!AVAIL || !AVAIL.days || !AVAIL.days[dateKey]) {
    tl.innerHTML += `<p>No availability for this date.</p>`;
    return;
  }

  const dayData = AVAIL.days[dateKey];

  // Loop through fields for this date
  dayData.fields.forEach(field => {
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
}



// ---- INIT ----
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded fired");
  await loadAvailability();
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
