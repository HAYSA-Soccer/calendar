// ======================================================
// WEEK VIEW RENDERER — MATCHES YOUR EXISTING CSS
// ======================================================

function renderTimelineBlock(parent, block) {
  const div = document.createElement("div");
  div.className = "timeline-block";

  // Type-based color
  if (block.type === "free") div.classList.add("timeline-free");
  else if (block.type === "practice") div.classList.add("timeline-practice");
  else if (block.type === "game") div.classList.add("timeline-game");
  else div.classList.add("timeline-admin");

  const start = timeToMinutes(block.start);
  const end = timeToMinutes(block.end);

  div.style.top = `${start}px`;
  div.style.height = `${end - start}px`;

  div.innerHTML = `
    <div class="block-time">${block.start_12} – ${block.end_12}</div>
    <div class="block-main">${block.title || block.team || block.field}</div>
  `;

  parent.appendChild(div);
}

function createWeekDayColumn(dayKey, dayData) {
  const col = document.createElement("div");
  col.className = "week-day-column";

  // Header
  const header = document.createElement("div");
  header.className = "week-day-header";
  header.textContent = dayKey;
  col.appendChild(header);

  // Complex container
  const timeline = document.createElement("div");
  timeline.className = "week-day-timeline";

  // Build complex columns
  const complexes = dayData.complexes || {};

  Object.keys(complexes).forEach(complexName => {
    const complexCol = document.createElement("div");
    complexCol.className = "week-complex-column";
    complexCol.dataset.loc = complexName;

    // Complex header
    const h = document.createElement("div");
    h.textContent = complexName;
    complexCol.appendChild(h);

    // Blocks for this complex
    const blocks = dayData.complex_timeline?.[complexName] || [];
    blocks.forEach(block => renderTimelineBlock(complexCol, block));

    timeline.appendChild(complexCol);
  });

  col.appendChild(timeline);
  return col;
}

function renderWeekViewUnified() {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  // Outer wrapper
  const weekTimeline = document.createElement("div");
  weekTimeline.id = "weekTimeline";

  const daysContainer = document.createElement("div");
  daysContainer.className = "week-days-container";

  // Build Monday → Sunday
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1);

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = d.toISOString().split("T")[0];

    const dayData = availability.days[key];
    if (dayData) {
      const col = createWeekDayColumn(key, dayData);
      daysContainer.appendChild(col);
    } else {
      // Empty day column
      const col = document.createElement("div");
      col.className = "week-day-column";
      const header = document.createElement("div");
      header.className = "week-day-header";
      header.textContent = key;
      col.appendChild(header);
      daysContainer.appendChild(col);
    }
  }

  weekTimeline.appendChild(daysContainer);
  container.appendChild(weekTimeline);
}
