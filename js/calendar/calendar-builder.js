// =========================
// BLOCK BUILDING LOGIC
// =========================

// IMPORTANT: You already have a fieldId → complex mapping.
// Keep your existing mapping EXACTLY as-is.
const fieldIdToComplex = {
  "H-HST": "Holbrook HS Turf",
  "H-HST1": "Holbrook HS Turf",
  "H-HST2": "Holbrook HS Turf",

  "H-Su1": "Sumner / Sean Joyce Fields",
  "H-Su1A": "Sumner / Sean Joyce Fields",
  "H-Su1B": "Sumner / Sean Joyce Fields",

  "H-BV1": "Brookville Fields",
  "H-BV2": "Brookville Fields",

  "H-AB1": "Avon Butler Fields",
  "H-AB2": "Avon Butler Fields"
};

// -------------------------
// Build unified blocks per field
// -------------------------
function buildUnifiedBlocks(dayData) {
  const unified = {};
  Object.keys(dayData).forEach(fieldId => {
    unified[fieldId] = sortBlocksByStart(dayData[fieldId] || []);
  });
  return unified;
}

// -------------------------
// Build complex map
// -------------------------
function buildFieldComplexMapForDay(dayData) {
  const map = {};
  Object.keys(dayData).forEach(fieldId => {
    map[fieldId] = fieldIdToComplex[fieldId] || "unknown";
  });
  return map;
}

// -------------------------
// Build unified complex blocks
// -------------------------
function buildUnifiedComplexBlocks(dayData) {
  const unified = {};
  const blocks = buildUnifiedBlocks(dayData);
  const complexMap = buildFieldComplexMapForDay(dayData);

  // Initialize complexes dynamically
  Object.values(complexMap).forEach(complex => {
    unified[complex] = [];
  });

  // Always include unknown bucket
  unified["unknown"] = [];

  // Assign blocks to complexes
  Object.keys(blocks).forEach(fieldId => {
    const list = blocks[fieldId];
    const complex = complexMap[fieldId] || "unknown";

    list.forEach(block => {
      unified[complex].push({
        ...block,
        fieldId
      });
    });
  });

  return unified;
}
