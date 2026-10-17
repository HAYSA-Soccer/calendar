async function initCalendarUnified() {
  console.log("initCalendarUnified loaded");
  await loadAvailability();
  renderWeekViewUnified();
}

function renderCurrentViewUnified() {
  renderWeekViewUnified();
}

initCalendarUnified();

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;

    if (view === 'week') {
      renderWeekViewUnified();
    } else if (view === 'day') {
      alert("Day view not implemented yet.");
    } else if (view === 'month') {
      alert("Month view not implemented yet.");
    } else if (view === 'search') {
      alert("Search view not implemented yet.");
    }
  });
});
