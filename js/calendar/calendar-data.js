// =========================
// CALENDAR DATA STORAGE
// =========================

let availability = {};
let blocksByDay = {};
let sunsetTimes = {};

let currentView = "week";
let currentDate = new Date();

// =========================
// JSON LOADING FUNCTIONS
// =========================

async function loadAvailability() {
  const res = await fetch("availability.json");
  availability = await res.json();
}

async function loadBlocks() {
  const res = await fetch("blocks.json");
  blocksByDay = await res.json();
}

async function loadSunsetTimes() {
  const res = await fetch("sunset.json");
  sunsetTimes = await res.json();
}
