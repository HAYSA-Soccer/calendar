function renderWeekViewUnified(dayData) {
  const container = document.getElementById("view-container");
  container.innerHTML = "";

  const blocks = buildUnifiedComplexBlocks(dayData);

  blocks.forEach(block => {
    const div = document.createElement("div");
    div.className = "block";

    const start = timeToMinutes(block.start);
    const end = timeToMinutes(block.end);

    div.style.top = start + "px";
    div.style.height = (end - start) + "px";

    div.textContent = block.title || block.team || block.field;

    container.appendChild(div);
  });
}
