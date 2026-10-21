import "../src/ui/index.css";
import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { Editor, Screens } from "./src/app";
import { Results, shouldShowBriefing } from "./src/briefing";
import { emptyDocument } from "./src/document";
import { type FlowListEntry, Home } from "./src/home";
import { findScreenState } from "./src/states";
import { supplierReviewExample } from "./src/supplier-review-example";

const params = new URLSearchParams(location.search);

/** Scales each screens-page frame to its box, so the 1440 × 900 editor fits two to a row. */
const ScreensPage = () => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      for (const frame of ref.current?.querySelectorAll("iframe") ?? []) {
        const width = frame.parentElement?.clientWidth ?? 1440;
        frame.style.setProperty("--frame-scale", String(width / 1440));
      }
    };
    update();
    globalThis.addEventListener("resize", update);
    return () => globalThis.removeEventListener("resize", update);
  });
  return (
    <div ref={ref}>
      <Screens />
    </div>
  );
};

/**
 * The Flows editor prototype on its own page. `?state=<id>` opens one screen (see `src/states.ts`); `?screens`
 * lays every screen out side by side; `?task=1|2|3` starts a test task; `?results` lists logged task sessions;
 * `?home` opens the flows list. With none, it opens a new flow and the briefing. The back arrow returns to the flows
 * list, which keeps its flows and search while you come and go.
 */
const App = () => {
  const state =
    findScreenState(params.get("state")) ?? findScreenState("blank")!;
  const [route, setRoute] = useState<
    { page: "home" } | { page: "editor"; id: string }
  >(params.has("home") ? { page: "home" } : { page: "editor", id: "current" });
  const [flows, setFlows] = useState<FlowListEntry[]>(() => [
    { id: "current", document: state.create().document },
    ...(params.has("state")
      ? []
      : [{ id: "supplierReview", document: supplierReviewExample() }]),
  ]);
  const [search, setSearch] = useState("");
  const [newCount, setNewCount] = useState(1);
  const taskId = params.has("task") ? Number(params.get("task")) : null;

  if (params.has("screens")) {
    return <ScreensPage />;
  }
  if (params.has("results")) {
    return <Results />;
  }
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
            ...current,
            { id, document: emptyDocument() },
          ]);
          setRoute({ page: "editor", id });
        }}
      />
    );
  }
  const flow =
    flows.find((candidate) => candidate.id === route.id) ?? flows[0]!;
  const opensFirst = route.id === "current";
  return (
    <Editor
      key={flow.id}
      initialDocument={flow.document}
      initialUi={
        opensFirst
          ? state.create().ui
          : {
              ...state.create().ui,
              selectedId: null,
              picker: null,
              openField: null,
              runOpen: false,
            }
      }
      // The briefing opens on the plain page (and with a task), not on the named screens.
      showBriefing={
        opensFirst &&
        !params.has("state") &&
        (taskId !== null || shouldShowBriefing())
      }
      initialTaskId={opensFirst ? taskId : null}
      onBack={(document) => {
        setFlows((current) =>
          current.map((candidate) =>
            candidate.id === flow.id ? { ...candidate, document } : candidate,
          ),
        );
        setRoute({ page: "home" });
      }}
    />
  );
};

createRoot(document.getElementById("root")!).render(<App />);
