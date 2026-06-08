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
              { group: ["*/persist", "@trellis/persist"], message: "engine must stay pure (§12): inject persist." },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          { name: "fetch", message: "engine must stay pure (§12): no network in engine." },
        ],
      },
    },
  ],
};
