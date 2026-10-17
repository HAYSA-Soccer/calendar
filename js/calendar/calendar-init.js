async function initCalendarUnified() {
  await loadAvailability();
  renderWeekViewUnified();
}

function renderCurrentViewUnified() {
  renderWeekViewUnified();
}

initCalendarUnified();
