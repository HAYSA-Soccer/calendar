// =========================
// CALENDAR RENDERING LOGIC
// =========================

function renderBlock(column, block) {
  const div = document.createElement("div");
  div.className = "block";

  const start = timeToMinutes(block.start);
  const end = timeToMinutes(block.end);

  div.style.top = start + "px";
  div.style.height = (end - start) + "px";

  // Label priority: title → team → type → fields
  div.textContent =
    block.title ||
    block.team ||
    block.type ||
    (block.fields ? block.fields.join(", ") : "");

  column.appendChild(div);
}

function createComplexColumn(name) {
  const col = document.createElement("div");
  col.className = "complex-column";
  col.dataset.complex = name;

  const header = document.createElement("div");
  header.className = "complex-header";
  header.textContent = name;

  col.appendChild(header);
  return col;
}

function renderWeekViewUnified(dayData) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const complexBlocks = buildUnifiedComplexBlocks(dayData);

  // Horizontal layout: one column per complex
  Object.keys(complexBlocks).forEach(complex => {
    const col = createComplexColumn(complex);

    complexBlocks[complex].forEach(block => {
      renderBlock(col, block);
    });

    container.appendChild(col);
  });
}
