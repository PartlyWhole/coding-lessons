import { createRoot } from "react-dom/client";
import { TrellisApp } from "./TrellisApp.js";
import { makeBrowserSandbox } from "./makeSandbox.js";

// Static-model entry: served from `python -m http.server` with NO server logic. The
// contentVersion + bundle URL are injected at build time (here: defaults for the proving slice).
const root = createRoot(document.getElementById("root")!);
root.render(
  <TrellisApp
    bundleUrl="./bundle.json"
    contentVersion={(globalThis as { __TRELLIS_CONTENT_VERSION__?: string }).__TRELLIS_CONTENT_VERSION__ ?? ""}
    cellId="cell.string_concat.text_plus_number"
    sandbox={makeBrowserSandbox()}
  />,
);
