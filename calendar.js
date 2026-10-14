// ---- DATE KEY HELPER ----
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
let currentDate = formatDateKey(new Date());

// ---- INIT ----
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initDayControls();
});

// ---- NAV ----
function initNav() {
  const navButtons = document.querySelectorAll(".nav button");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      console.log("Switch view:", view);
    });
  });
}

// ---- DAY CONTROLS ----
function initDayControls() {
  const container = document.getElementById("view-container");

  container.innerHTML = `
    <h2>Day View</h2>
    <div class="controls">
      <button id="prevDay">←</button>
      <span class="day-date">${formatHumanDate(currentDate)}</span>
      <button id="nextDay">→</button>
    </div>
    <p id="debugLine"></p>
  `;

  const prevBtn = document.getElementById("prevDay");
  const nextBtn = document.getElementById("nextDay");
  const dateSpan = container.querySelector(".day-date");
  const debugLine = document.getElementById("debugLine");

  prevBtn.addEventListener("click", () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    currentDate = formatDateKey(d);
    dateSpan.textContent = formatHumanDate(currentDate);
    debugLine.textContent = `Prev clicked → ${currentDate}`;
    console.log("Prev clicked, currentDate =", currentDate);
  });

  nextBtn.addEventListener("click", () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    currentDate = formatDateKey(d);
    dateSpan.textContent = formatHumanDate(currentDate);
    debugLine.textContent = `Next clicked → ${currentDate}`;
    console.log("Next clicked, currentDate =", currentDate);
  });
}
