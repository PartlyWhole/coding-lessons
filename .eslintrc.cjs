/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  env: { browser: true, es2022: true, node: true },
  rules: {},
  overrides: [
    {
      // §12 purity boundary: the engine must not import effectful libs.
      files: ["packages/engine/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "react", message: "engine must stay pure (§12): no React." },
              { name: "react-dom", message: "engine must stay pure (§12): no React." },
              { name: "idb", message: "engine must stay pure (§12): inject persist instead." },
              { name: "pyodide", message: "engine must stay pure (§12): inject the sandbox instead." },
            ],
            patterns: [
              // Catch subpath imports the bare `paths` entries miss (e.g. react-dom/client,
              // react/jsx-runtime) — modern React is imported via these, not the bare package.
              { group: ["react/*", "react-dom/*"], message: "engine must stay pure (§12): no React." },
              { group: ["*/persist", "@trellis/persist"], message: "engine must stay pure (§12): inject persist." },
            ],
          },
        ],
        // NOTE: no-restricted-globals only catches a bare `fetch(...)`. Qualified forms
        // (`globalThis.fetch`, `window.fetch`) are NOT caught by this rule — acceptable for
        // a preventive M0 scaffold; the real guarantee is that engine code injects its
        // effectful deps. Revisit when packages/engine is built (M2).
        "no-restricted-globals": [
          "error",
          { name: "fetch", message: "engine must stay pure (§12): no network in engine." },
        ],
      },
    },
  ],
};
