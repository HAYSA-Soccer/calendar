console.log("calendar.js LOADED");

let currentDate = new Date();

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded fired");
  render();
});

function render() {
  const container = document.getElementById("view-container");

  container.innerHTML = `
    <h2>Day View</h2>
    <div class="controls">
      <button id="prevDay">←</button>
      <span class="day-date">${currentDate.toDateString()}</span>
      <button id="nextDay">→</button>
    </div>
    <p id="debugLine"></p>
  `;

  document.getElementById("prevDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() - 1);
    render();
  };

  document.getElementById("nextDay").onclick = () => {
    currentDate.setDate(currentDate.getDate() + 1);
    render();
  };
}
