/**
 * The Flows app on its URL routes (`router.ts`) and its data (`app-store.ts`): the flows list, a flow's editor,
 * History and runs. A reload or a hot update lands on the same page with the same flows.
 */
import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Editor } from "./app";
import {
  archiveFlow,
  createFlow,
  restoreFlow,
  runsOf,
  useAppState,
} from "./app-store";
import { useConfirmTake } from "./confirm-dialog";
import { Toast } from "./ds-parts/toast";
import { type EditorUi, initialUi } from "./editor-context";
import { HashShell } from "./hash-shell";
import { Home } from "./home";
import { navigate, routePath, useLocation } from "./router";
import { runLabel } from "./run-id";
import { outcomeOf, outcomeState, runProgress, runWhen } from "./run-history";
import { monthlyReviewId } from "./seed-flows";
import { TriggersPage } from "./triggers-page";
import { versionLabel } from "./versions";

/** The supplier review opens as J6 draws it: Start 148 px in, at 45% (zoom 0.46), so the whole flow shows. */
const reviewViewport: Partial<EditorUi> = {
  viewport: { left: 147.5, top: 401.5, zoom: 0.46 },
  zoomBase: 0.46 / 0.45,
};

const uiFor = (flowId: string, query: URLSearchParams): EditorUi => {
  const step = query.get("step");
  return {
    ...initialUi,
    ...(flowId === monthlyReviewId ? reviewViewport : {}),
    selectedId: step,
    selectedIds: step ? [step] : [],
  };
};

/** Presses the pointer on an element, for DS menus that open on pointer down. */
const press = (selector: string) => {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  for (const type of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    element?.dispatchEvent(
      new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  }
};

/** `?menu=runs` (J6.8): the run picker opens once the run is on screen. */
const useOpenMenu = (menu: string | null) => {
  useEffect(() => {
    if (menu !== "runs") {
      return;
    }
    const timer = setTimeout(() => press("[data-run-picker]"), 600);
    return () => clearTimeout(timer);
  }, [menu]);
};

const NewFlow = () => {
  useEffect(() => {
    const id = createFlow();
    navigate(routePath({ page: "editor", flowId: id }), { replace: true });
  }, []);
  return null;
};

const pageStyle = css({
  padding: "12",
  fontFamily: "body",
  textStyle: "sm",
  color: "neutral.fg.body",
  backgroundColor: "neutral.bgSolid.min",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const linkStyle = css({
  alignSelf: "flex-start",
  color: "blue.fg.link",
  cursor: "pointer",
  textDecoration: "underline",
});

/** A page that is not built yet: says so, and links back to the flows. */
const Stub = ({ title, note }: { title: string; note: string }) => (
  <HashShell>
    <div className={pageStyle}>
      <span
        className={css({
          textStyle: "lg",
          fontWeight: "semibold",
          color: "neutral.fg.heading",
        })}
      >
        {title}
      </span>
      <span>{note}</span>
      <button
        type="button"
        className={linkStyle}
        onClick={() => navigate("/flows")}
      >
        Back to flows
      </button>
    </div>
  </HashShell>
);

export const RoutedApp = () => {
  const { route, query } = useLocation();
  const state = useAppState();
  const [search, setSearch] = useState("");
  // The flows list reads each newest run once, when it opens.
  const [listedAt] = useState(() => Date.now());
  useOpenMenu(query.get("menu"));
  // ?confirm=undo: Archive acts at once and the flows list shows a toast with Undo.
  const confirmTake = useConfirmTake();
  const [archived, setArchived] = useState<{
    flow: (typeof state.flows)[number];
    index: number;
  } | null>(null);

  switch (route.page) {
    case "flows":
      return (
        <Home
          notice={
            archived ? (
              <Toast
                text={`Archived ${archived.flow.document.name}`}
                action="Undo"
                onAction={() => restoreFlow(archived.flow, archived.index)}
                onDone={() => setArchived(null)}
              />
            ) : null
          }
          flows={
            route.empty
              ? []
              : state.flows.map((flow) => {
                  const runs = runsOf(state, flow.id);
                  const newest = runs[0];
                  return {
                    id: flow.id,
                    document: flow.document,
                    lastEdited: flow.meta.updated,
                    version: versionLabel(flow.meta.version),
                    runCount: runs.length,
                    lastRun: newest
                      ? {
                          state: outcomeState[outcomeOf(newest, listedAt)],
                          progress: runProgress(newest, listedAt),
                          label: `${runLabel(newest)} · ${runWhen(newest)}`,
                        }
                      : undefined,
                  };
                })
          }
          search={search}
          onSearch={setSearch}
          onOpen={(flowId) => navigate(routePath({ page: "editor", flowId }))}
          onNew={() => navigate(routePath({ page: "newFlow" }))}
        />
      );
    case "newFlow":
      return <NewFlow />;
    case "editor":
    case "history":
    case "run": {
      const flow = state.flows.find(
        (candidate) => candidate.id === route.flowId,
      );
      if (!flow) {
        return (
          <Stub
            title="No flow here"
            note={`Nothing is called “${route.flowId}”. It may have been archived, or the demo data was reset.`}
          />
        );
      }
      return (
        <Editor
          key={flow.id}
          flowId={flow.id}
          initialDocument={flow.document}
          initialUi={uiFor(flow.id, query)}
          opened={
            route.page === "history"
              ? { runId: null }
              : route.page === "run"
                ? { runId: route.runId }
                : null
          }
          onBack={() => navigate("/flows")}
          onArchive={() => {
            if (confirmTake === "undo") {
              setArchived({ flow, index: state.flows.indexOf(flow) });
            }
            archiveFlow(flow.id);
            navigate("/flows");
          }}
        />
      );
    }
    case "triggers":
      return <TriggersPage flowId={route.flowId} />;
    case "runs":
      return (
        <Stub title="All runs" note="Runs across every flow. Not built yet." />
      );
    default:
      return null;
  }
};
