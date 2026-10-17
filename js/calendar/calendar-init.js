// =========================
// CALENDAR INITIALIZATION
// =========================

async function initCalendarUnified() {
  await loadAvailability();
  await loadBlocks();
  await loadSunsetTimes();
  await loadComplexMap();
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

// NOTE: Your HTML does NOT have #next or #prev buttons.
// These listeners must be removed to avoid null errors.

// Start the calendar
initCalendarUnified();
