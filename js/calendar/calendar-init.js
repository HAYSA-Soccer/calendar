async function initCalendarUnified() {
  await loadAvailability();
  renderCurrentViewUnified();
}

function renderCurrentViewUnified() {
  const dayKey = currentDate.toISOString().split("T")[0];
  const dayData = availability.days[dayKey] || {};
  renderWeekViewUnified(dayData);
}

initCalendarUnified();
