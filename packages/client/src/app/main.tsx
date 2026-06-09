// Greenhouse stylesheet + self-hosted Fontsource woff2 (static-hosting constraint —
// no CDN <link>). Weights per the design handback: Baloo 700; Nunito 400/600/800;
// JetBrains Mono 400/500/700.
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "../styles/trellis-tokens.css";
import "../styles/trellis-ui.css";

import { createRoot } from "react-dom/client";
import { TrellisApp } from "./TrellisApp.js";
import { makeBrowserSandbox } from "./makeSandbox.js";

// Static-model entry: served from `python -m http.server` with NO server logic.
// scripts/build-app.mjs bundles this module to dist/app/main.js, emits bundle.json
// beside it, and injects the matching contentVersion at build time.
declare const __TRELLIS_CONTENT_VERSION__: string | undefined;
const contentVersion = typeof __TRELLIS_CONTENT_VERSION__ === "string" ? __TRELLIS_CONTENT_VERSION__ : "";

const sandbox = makeBrowserSandbox();
const root = createRoot(document.getElementById("root")!);
root.render(
  <TrellisApp
    bundleUrl={new URL("./bundle.json", import.meta.url).href}
    contentVersion={contentVersion}
    cellId="cell.string_concat.text_plus_number"
    sandbox={sandbox}
    warmup={() => sandbox.warmup()}
  />,
);
