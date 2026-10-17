// =========================
// CALENDAR INITIALIZATION
// =========================

async function initCalendarUnified() {
  await loadAvailability();
  await loadBlocks();
  await loadSunsetTimes();
  renderCurrentViewUnified();
}

function renderCurrentViewUnified() {
  const dayKey = currentDate.toISOString().split("T")[0];
  const dayData = blocksByDay[dayKey] || {};
  renderWeekViewUnified(dayData);
}

// =========================
// EVENT LISTENERS
// =========================

document.getElementById("next").addEventListener("click", () => {
  currentDate.setDate(currentDate.getDate() + 7);
  renderCurrentViewUnified();
});

document.getElementById("prev").addEventListener("click", () => {
  currentDate.setDate(currentDate.getDate() - 7);
  renderCurrentViewUnified();
});

// Start the calendar
initCalendarUnified();
