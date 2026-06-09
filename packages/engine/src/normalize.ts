// Normalization for recall/predict free-text comparison (§8 compareNonBuild,
// §7 recallEquals). Deterministic, locale-independent: trim, lowercase, collapse
// any run of whitespace to a single space.
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
