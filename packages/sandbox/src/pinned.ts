// Single source of truth for the pinned Pyodide runtime. The exact version must be
// confirmed/bumped against the CDN in a NETWORKED environment, and checked for
// pygame-ce >= 0.26 compatibility (§17.1). Pinned (not "latest") for determinism.
export const PYODIDE_VERSION = "0.27.2";
export const PINNED_PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
