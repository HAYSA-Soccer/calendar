// =========================
// CALENDAR UTILITY FUNCTIONS
// =========================

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function to12h(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  h = (h % 12) || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sortBlocksByStart(blocks) {
  return blocks.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}
