// ======================================================
// BUILDER: USE COMPLEX TIMELINE DIRECTLY
// ======================================================

// dayData.complex_timeline = {
//   "full": [ { start, end, type, fields }, ... ],
//   "half": [ ... ],
//   "TURF": [ ... ],
//   ...
// }

function buildUnifiedComplexBlocks(dayData) {
  if (!dayData || !dayData.complex_timeline) {
    return {};
  }

  return dayData.complex_timeline;
}
