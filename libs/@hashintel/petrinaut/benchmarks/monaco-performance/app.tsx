import { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  probabilisticSatellitesSDCPN,
  supplyChainWithDisruption,
} from "@hashintel/petrinaut-core/examples";

import { CodeEditor } from "../../src/ui/monaco/code-editor";
import { MonacoProvider } from "../../src/ui/monaco/provider";
import { PetrinautStoryProvider } from "../../src/ui/petrinaut-story-provider";

const query = new URLSearchParams(location.search);
const example =
  query.get("model") === "satellites"
    ? probabilisticSatellitesSDCPN
    : supplyChainWithDisruption;
const fixture =
  example.petriNetDefinition.places.find((place) => place.visualizerCode)
    ?.visualizerCode ?? "return 42;";
const variant = query.get("variant") ?? "baseline";

if (["no-css-effects", "no-motion", "combined-fast"].includes(variant)) {
  const style = document.createElement("style");
  style.textContent =
    ".petrinaut-root * { transition: none !important; animation: none !important; }" +
    (variant === "no-css-effects"
      ? ".petrinaut-root * { filter: none !important; backdrop-filter: none !important; box-shadow: none !important; }"
      : "");
  document.head.append(style);
  // Preserve the receiver when calling the original native method.
  // oxlint-disable-next-line typescript/unbound-method
  const animate = Element.prototype.animate;
  Element.prototype.animate = function animateInstantly(keyframes, options) {
    return animate.call(
      this,
      keyframes,
      typeof options === "number" ? 0 : { ...options, duration: 0 },
    );
  };
}
if (variant === "contain") {
  const style = document.createElement("style");
  style.textContent = ".monaco-editor { contain: layout paint style; }";
  document.head.append(style);
}

const Micro = () => {
  const [visible, setVisible] = useState(query.has("open"));
  const [value, setValue] = useState(fixture);
  const [document, setDocument] = useState(0);
  const [width, setWidth] = useState(600);
  const [opened, setOpened] = useState(visible);
  if (visible && !opened) setOpened(true);
  return (
    <MonacoProvider>
      <div className="petrinaut-root" style={{ padding: 20 }}>
        <button
          type="button"
          data-bench-action="open"
          onClick={() => setVisible(!visible)}
        >
          Toggle editor
        </button>
        <button
          type="button"
          data-bench-action="switch"
          onClick={() => setDocument(document + 1)}
        >
          Switch document
        </button>
        <button
          type="button"
          data-bench-action="resize"
          onClick={() => setWidth(width === 600 ? 1000 : 600)}
        >
          Resize editor
        </button>
        <div
          style={{ width, height: 480, display: visible ? undefined : "none" }}
          inert={!visible}
        >
          {(visible || (variant === "retain" && opened)) && (
            <CodeEditor
              path={`benchmark-${query.has("unique") ? document : document % 2}.tsx`}
              language="typescript"
              height="100%"
              value={value}
              onChange={(next) => setValue(next ?? "")}
            />
          )}
        </div>
      </div>
    </MonacoProvider>
  );
};

const App = () =>
  query.get("surface") === "micro" ? (
    <Micro />
  ) : (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={example.title}
        initialDefinition={example.petriNetDefinition}
      />
    </div>
  );

export const mountApp = () =>
  createRoot(document.getElementById("root")!).render(
    <Profiler
      id="app"
      onRender={(
        id,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      ) => {
        performance.measure(`react:${id}:${phase}`, {
          start: startTime,
          end: commitTime,
          detail: { actualDuration, baseDuration },
        });
      }}
    >
      <App />
    </Profiler>,
  );
