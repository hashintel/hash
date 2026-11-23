import { Profiler, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createJsonDocHandle,
  parseDocumentText,
  parseSDCPNFile,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import * as examples from "@hashintel/petrinaut-core/examples";

import { CodeEditor } from "../../src/ui/monaco/code-editor";
import { MonacoProvider } from "../../src/ui/monaco/provider";
import { Petrinaut } from "../../src/ui/petrinaut";
import { definePetrinautPlugin } from "../../src/ui/plugins/define-petrinaut-plugin";
import { PetrinautStoryProvider } from "../../src/ui/stories/petrinaut-story-provider";
import { tileNet } from "../../src/ui/stories/story-tiled-net";

const query = new URLSearchParams(location.search);
// `model` is `satellites`, `supply-chain` (the default), or the name any
// other example is exported under, such as `cafeQueue`.
const models: Record<string, (typeof examples)[keyof typeof examples]> = {
  ...examples,
  satellites: examples.probabilisticSatellitesSDCPN,
  "supply-chain": examples.supplyChainWithDisruption,
};

/**
 * A net read from a file the benchmark's server serves, as the editor's
 * import reads it: `modelUrl=/models/my-net.yaml`, with the file copied into
 * the folder the build was written to. For a net that is too large, or not
 * ours, to be an example.
 */
const loadModel = async (
  url: string,
): Promise<{ title: string; petriNetDefinition: SDCPN }> => {
  const text = await (await fetch(url)).text();
  const parsed = parseDocumentText(text);
  if (!parsed.ok) {
    throw new Error(`${url}: ${parsed.error}`);
  }
  const imported = parseSDCPNFile(parsed.data);
  if (!imported.ok) {
    throw new Error(`${url}: ${imported.error}`);
  }
  const { title } = parsed.data as { title?: unknown };
  return {
    title: typeof title === "string" ? title : url,
    petriNetDefinition: imported.sdcpn,
  };
};

const modelUrl = query.get("modelUrl");
const chosen: { title: string; petriNetDefinition: SDCPN } = modelUrl
  ? await loadModel(modelUrl)
  : (models[query.get("model") ?? "supply-chain"] ??
    examples.supplyChainWithDisruption);
// `copies=12` makes a net of about 500 nodes out of the 43 of Supply Chain.
const example = {
  ...chosen,
  petriNetDefinition: tileNet(
    chosen.petriNetDefinition,
    Number(query.get("copies") ?? 1),
  ),
};
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

const chatTurns = Array.from({ length: 40 }, (_, index) => index);

/** A conversation's worth of elements, so the panel has something to lay out. */
const BenchmarkChat = () => (
  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
    {chatTurns.map((turn) => (
      <p key={turn} style={{ margin: "0 0 12px" }}>
        {turn % 2 === 0
          ? "Add a place for parts waiting at the loading dock, and connect it to the assembly line."
          : "Done. The new place takes the Part type, and the transition into assembly now reads from it at one part per firing."}
      </p>
    ))}
    <input aria-label="Message" placeholder="Ask about this net" />
  </div>
);

/** An AI assistant for the editor to dock, float and close (`assistant=1`). */
const benchmarkAssistant = definePetrinautPlugin(
  { id: "benchmark.assistant", name: "Benchmark assistant", assistant: true },
  { assistant: { content: <BenchmarkChat /> } },
);
const plugins = query.has("assistant") ? [benchmarkAssistant] : [];

/**
 * A host that does what the website does, at its worst (`host=website`). It
 * saves a new last-updated time for the open net on every edit, so the net
 * list it passes says something new on every key. Nothing in it is memoized,
 * so its callbacks and its `slots` are new objects on every render too.
 */
const WebsiteLikeHost = () => {
  "use no memo"; // The benchmark is of a host that memoizes nothing.
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: "benchmark-net",
      initial: example.petriNetDefinition,
    }),
  );
  const [title, setTitle] = useState(example.title);
  const [edits, setEdits] = useState(0);
  useEffect(
    () => handle.subscribe(() => setEdits((count) => count + 1)),
    [handle],
  );

  return (
    <Petrinaut
      handle={handle}
      title={title}
      setTitle={(next) => setTitle(next)}
      existingNets={[
        {
          netId: handle.id,
          title,
          lastUpdated: new Date(edits * 1000).toISOString(),
        },
      ]}
      createNewNet={() => {}}
      loadPetriNet={() => {}}
      plugins={plugins}
      slots={{ settingsLabs: <span>Host settings</span> }}
    />
  );
};

const FullEditor = () =>
  query.get("host") === "website" ? (
    <WebsiteLikeHost />
  ) : (
    <PetrinautStoryProvider
      initialTitle={example.title}
      initialDefinition={example.petriNetDefinition}
      plugins={plugins}
    />
  );

const App = () =>
  query.get("surface") === "micro" ? (
    <Micro />
  ) : (
    <div style={{ height: "100vh", width: "100vw" }}>
      <FullEditor />
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
