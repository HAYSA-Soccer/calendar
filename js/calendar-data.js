let availability = {};
let currentView = "week";
let currentDate = new Date();

async function loadAvailability() {
  try {
    const res = await fetch("data/availability.json");
    availability = await res.json();
    console.log("Availability loaded:", availability);
  } catch (err) {
    console.error("Failed to load availability.json", err);
  }
}
