// First: old links move to their routes before the app store reads the URL.
import "./src/legacy-redirect";
import "../src/ui/index.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { IconProvider } from "@hashintel/ds-components";

import { Editor } from "./src/app";
import { Results } from "./src/briefing";
import { emptyDocument } from "./src/document";
import { type EditorUi, initialUi } from "./src/editor-context";
import { Guide } from "./src/guide";
import { type FlowListEntry, Home } from "./src/home";
import { RoutedApp } from "./src/routed-app";
import { useLocation } from "./src/router";
import { newFlowUi, type ScreenBuild, screenBuilds } from "./src/screen-builds";
import { ScreenJumper, ScreenPlaceholder } from "./src/screen-jumper";
import { findScreen } from "./src/screens";
import { findScreenState } from "./src/states";
import { initPalette } from "./src/status-colors";
import { thinIcons } from "./src/thin-icons";

const params = new URLSearchParams(location.search);

/**
 * Where the page opens. `?screen=<id>` opens one Figma screen ("J2.54"; see `src/screens.ts`), live when
 * `src/screen-builds.ts` builds it and as its Figma export otherwise. `?state=<id>` still opens the older named
 * states in `src/states.ts`. With neither, the prototype opens on J0.1, the empty flows list, and runs from there.
 */
const legacyState = findScreenState(params.get("state"));
const screenParam = params.get("screen");
const screen = findScreen(screenParam ?? (legacyState ? null : "J0.1"));

const initialBuild = (): ScreenBuild | null => {
  if (legacyState) {
    const created = legacyState.create();
    return legacyState.page === "home"
      ? { page: "home", flows: [] }
      : { page: "editor", ...created };
  }
  return screen ? (screenBuilds[screen.id]?.() ?? null) : null;
};

/** A UI with nothing open, for a flow opened from the list. */
const restingUi = (ui: EditorUi): EditorUi => ({
  ...ui,
  selectedId: null,
  picker: null,
  openField: null,
  runOpen: false,
});

const App = ({ build }: { build: ScreenBuild }) => {
  const taskId = params.has("task") ? Number(params.get("task")) : null;
  const [route, setRoute] = useState<
    { page: "home" } | { page: "editor"; id: string }
  >(
    build.page === "home"
      ? { page: "home" }
      : { page: "editor", id: "current" },
  );
  const [flows, setFlows] = useState<FlowListEntry[]>(() =>
    build.page === "home"
      ? build.flows
      : [{ id: "current", document: build.document, lastEdited: "Just now" }],
  );
  const [search, setSearch] = useState("");
  const [newCount, setNewCount] = useState(1);

  if (route.page === "home") {
    return (
      <Home
        flows={flows}
        search={search}
        onSearch={setSearch}
        onOpen={(id) => setRoute({ page: "editor", id })}
        onNew={() => {
          const id = `new-${newCount}`;
          setNewCount((count) => count + 1);
          setFlows((current) => [
            { id, document: emptyDocument(), lastEdited: "Just now" },
            ...current,
          ]);
          setRoute({ page: "editor", id });
        }}
      />
    );
  }
  const flow =
    flows.find((candidate) => candidate.id === route.id) ?? flows[0]!;
  const opensFirst = route.id === "current";
  const baseUi = build.page === "editor" ? build.ui : initialUi;
  return (
    <Editor
      key={flow.id}
      initialDocument={flow.document}
      initialUi={
        opensFirst
          ? baseUi
          : flow.document.steps.length === 0
            ? newFlowUi()
            : { ...restingUi(baseUi), viewport: undefined }
      }
      showBriefing={opensFirst && taskId !== null}
      initialTaskId={opensFirst ? taskId : null}
      onBack={(document) => {
        setFlows((current) =>
          current.map((candidate) =>
            candidate.id === flow.id
              ? { ...candidate, document, lastEdited: "Just now" }
              : candidate,
          ),
        );
        setRoute({ page: "home" });
      }}
    />
  );
};

const NotFound = ({ id }: { id: string }) => (
  <div style={{ padding: 40, fontFamily: "sans-serif" }}>
    No Figma screen is called “{id}”. Open the screen list with ⌘K.
  </div>
);

/** A screen opened by `?screen=`: its build, then what the user has just done in the frame. */
const ScreenPage = () => {
  const [build] = useState(initialBuild);
  useEffect(() => {
    if (!build?.act) {
      return;
    }
    const timer = setTimeout(() => {
      void build.act?.();
    }, 500);
    return () => clearTimeout(timer);
  }, [build]);
  return (
    <>
      {build ? (
        <App build={build} />
      ) : screen ? (
        <ScreenPlaceholder screen={screen} />
      ) : (
        <NotFound id={screenParam ?? ""} />
      )}
      <ScreenJumper current={legacyState ? undefined : screen} />
    </>
  );
};

/** The app's routes (`/flows/…`); `/` with an old `?screen=` or `?state=` keeps the Journeys screens. */
const Routes = () => {
  const { route } = useLocation();
  if (route.page === "legacy") {
    return <ScreenPage />;
  }
  return (
    <>
      <RoutedApp />
      <ScreenJumper />
    </>
  );
};

const Root = () => {
  if (params.has("results")) {
    return <Results />;
  }
  if (params.has("guide")) {
    return <Guide />;
  }
  if (params.has("task")) {
    // A test task starts on a blank canvas with its briefing.
    return (
      <>
        <App
          build={{ page: "editor", document: emptyDocument(), ui: initialUi }}
        />
        <ScreenJumper />
      </>
    );
  }
  return <Routes />;
};

// Hot reloads re-run this module: keep one root, so an edit re-renders instead of mounting a second React tree.
const holder = globalThis as typeof globalThis & {
  flowsPrototypeRoot?: ReturnType<typeof createRoot>;
};
initPalette();
holder.flowsPrototypeRoot ??= createRoot(document.getElementById("root")!);
holder.flowsPrototypeRoot.render(
  <IconProvider icons={thinIcons}>
    <Root />
  </IconProvider>,
);
