// ======================================================
// BUILDER: USE MERGED BLOCKS DIRECTLY
// ======================================================

// Your availability.json already contains:
// dayData.merged = [ { field, start, end, type, title, ... }, ... ]

function buildUnifiedComplexBlocks(dayData) {
  // If merged blocks exist, use them directly
  if (dayData && Array.isArray(dayData.merged)) {
    return dayData.merged;
  }

  // Otherwise return an empty array
  return [];
}
