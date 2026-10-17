// =========================
// WEEK VIEW RENDERER (DAY COLUMNS)
// =========================

function renderBlock(column, block) {
  const div = document.createElement("div");
  div.className = "block";

  const start = timeToMinutes(block.start);
  const end = timeToMinutes(block.end);

  div.style.top = start + "px";
  div.style.height = (end - start) + "px";

  div.textContent =
    block.title ||
    block.team ||
    block.type ||
    block.field ||
    "";

  column.appendChild(div);
}

function createDayColumn(dayKey) {
  const col = document.createElement("div");
  col.className = "day-column";
  col.dataset.day = dayKey;

  const header = document.createElement("div");
  header.className = "day-header";
  header.textContent = dayKey;

  col.appendChild(header);
  return col;
}

function renderWeekViewUnified(dayData) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  // Build 7-day week starting from currentDate (Monday → Sunday)
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1); // Monday

  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = d.toISOString().split("T")[0];
    days.push(key);
  }

  days.forEach(dayKey => {
    const col = createDayColumn(dayKey);

    const day = availability.days[dayKey];
    if (day && Array.isArray(day.merged)) {
      day.merged.forEach(block => renderBlock(col, block));
    }

    container.appendChild(col);
  });
}
