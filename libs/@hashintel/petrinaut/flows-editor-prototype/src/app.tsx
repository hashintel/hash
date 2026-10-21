import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Menu,
  PortalContainerContext,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddNodePicker } from "./add-node-picker";
import { Briefing, markBriefingSeen, TaskCard } from "./briefing";
import { FlowCanvas } from "./canvas";
import { EditorContext, type EditorUi } from "./editor-context";
import { PropertiesPanel } from "./properties-panel";
import { RunDialog } from "./run-dialogs";
import { validateDocument } from "./shapes";
import { screenStates } from "./states";
import {
  findTask,
  newSession,
  type TaskSession,
  tasks,
  writeSession,
} from "./tasks";
import { FlowToolbar, organize } from "./toolbar";

import type { EditorDocument } from "./document";

const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "[100vh]",
  width: "[100vw]",
  backgroundColor: "neutral.s10",
  fontFamily: "body",
  color: "neutral.s120",
});

const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[52px]",
  paddingX: "3",
  backgroundColor: "neutral.s00",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s40",
  flexShrink: 0,
});

const titleInputStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderRadius: "sm",
  paddingX: "1",
  height: "[28px]",
  width: "[280px]",
  _hover: { backgroundColor: "neutral.s15" },
  _focus: {
    outline: "[2px solid var(--colors-blue-s90)]",
    backgroundColor: "neutral.s00",
  },
});

export const Editor = ({
  initialDocument,
  initialUi,
  showBriefing = false,
  initialTaskId = null,
  onBack,
}: {
  initialDocument: EditorDocument;
  initialUi: EditorUi;
  showBriefing?: boolean;
  initialTaskId?: number | null;
  /** Back to the flows list, handing it the flow as it is now. */
  onBack?: (document: EditorDocument) => void;
}) => {
  const [document, setDocumentState] = useState(initialDocument);
  const [ui, setUiState] = useState(initialUi);
  const [mode, setMode] = useState<"select" | "hand">("select");
  const [briefingOpen, setBriefingOpen] = useState(showBriefing);
  const [session, setSession] = useState<TaskSession | null>(() => {
    if (!findTask(initialTaskId)) {
      return null;
    }
    const started = newSession(initialTaskId!);
    writeSession(started);
    return started;
  });

  // Silent success detection: the first moment the flow does the job is written to the log, never shown. It only
  // syncs to storage, so the session in state stays as it is.
  const goalReachedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.doneAt || goalReachedAt.current) {
      return;
    }
    if (findTask(session.taskId)?.grade(document) === "complete") {
      const at = new Date().toISOString();
      goalReachedAt.current = at;
      writeSession({
        ...session,
        goalReachedAt: at,
        events: [...session.events, { type: "goal reached", at }],
      });
    }
  }, [document, session]);

  const startTask = (taskId: number) => {
    goalReachedAt.current = null;
    const started = newSession(taskId);
    writeSession(started);
    setSession(started);
  };

  const finishTask = () => {
    if (!session) {
      return;
    }
    const at = new Date().toISOString();
    const reached = goalReachedAt.current;
    const next: TaskSession = {
      ...session,
      ...(reached ? { goalReachedAt: reached } : {}),
      doneAt: at,
      grade: findTask(session.taskId)?.grade(document) ?? "fail",
      events: [
        ...session.events,
        ...(reached ? [{ type: "goal reached" as const, at: reached }] : []),
        { type: "done clicked", at },
      ],
    };
    writeSession(next);
    setSession(next);
  };

  const reopenBriefing = () => {
    if (session && !session.doneAt) {
      const next: TaskSession = {
        ...session,
        events: [
          ...session.events,
          { type: "briefing reopened", at: new Date().toISOString() },
        ],
      };
      writeSession(next);
      setSession(next);
    }
    setBriefingOpen(true);
  };
  const portalRef = useRef<HTMLDivElement>(null);
  const addNodeRef = useRef<HTMLButtonElement>(null);
  const canvasControls = useRef<{
    fitView: () => void;
    zoom: (by: number) => void;
  } | null>(null);

  const validation = validateDocument(document);
  const errorCount =
    validation.flowLevel.filter((diagnostic) => diagnostic.severity === "error")
      .length +
    [...validation.byStep.values()]
      .flat()
      .filter((diagnostic) => diagnostic.severity === "error").length +
    validation.incomplete.size;
  const mockCount = validation.mockFields.size;
  const allMessages = [
    ...validation.flowLevel.map((diagnostic) => diagnostic.message),
    ...[...validation.byStep.values()]
      .flat()
      .map((diagnostic) => diagnostic.message),
  ];

  const context = {
    document,
    setDocument: (update: (current: EditorDocument) => EditorDocument) =>
      setDocumentState(update),
    ui,
    setUi: (update: (current: EditorUi) => EditorUi) => setUiState(update),
    validation,
  };

  return (
    <PortalContainerContext value={portalRef}>
      <EditorContext value={context}>
        <div ref={portalRef} className={`${rootStyle} petrinaut-root`}>
          <header className={topBarStyle}>
            <Button
              size="sm"
              variant="ghost"
              iconName="arrowLeft"
              aria-label="Back to flows"
              tooltip="Back to flows"
              disabled={!onBack}
              onClick={() => onBack?.(document)}
            />
            <input
              className={titleInputStyle}
              value={document.name}
              aria-label="Flow name"
              onChange={(event) => {
                const name = event.target.value;
                setDocumentState((current) => ({ ...current, name }));
              }}
            />
            <div
              className={css({
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "2",
              })}
            >
              <Tooltip
                content={
                  errorCount > 0
                    ? allMessages.slice(0, 6).join(" · ") ||
                      "Some steps are not set up yet"
                    : mockCount > 0
                      ? `The engine's validator finds no errors, but ${mockCount} fields hold values it can't represent yet (text mixed with values, lists of several sources).`
                      : "The engine's validator finds no errors"
                }
              >
                <span
                  className={css({
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "1",
                    fontSize: "xs",
                    color: errorCount === 0 ? "neutral.s100" : "red.s100",
                  })}
                >
                  <span
                    className={css({
                      width: "[8px]",
                      height: "[8px]",
                      borderRadius: "full",
                      backgroundColor:
                        errorCount === 0 ? "green.s90" : "red.s90",
                    })}
                  />
                  {errorCount > 0
                    ? `${errorCount} to fix`
                    : mockCount > 0
                      ? `Ready · ${mockCount} mock`
                      : "Ready"}
                </span>
              </Tooltip>
              <Button
                size="sm"
                variant="solid"
                iconName="play"
                onClick={() =>
                  setUiState((current) => ({ ...current, runOpen: true }))
                }
              >
                Run
              </Button>
              <Menu
                items={tasks.map((task) => ({
                  id: String(task.id),
                  text: `Task ${task.id}`,
                  onClick: () => startTask(task.id),
                }))}
                trigger={
                  <Button size="sm" variant="ghost">
                    Tasks
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="ghost"
                iconName="info"
                aria-label="About this prototype"
                tooltip="About this prototype"
                onClick={reopenBriefing}
              />
            </div>
          </header>
          <main
            className={css({
              display: "flex",
              flex: "1",
              minHeight: "[0]",
            })}
          >
            <ReactFlowProvider>
              {/* The canvas and its floating parts, left of the docked panel (↳ Current: canvas, then a 420 panel). */}
              <div
                className={css({
                  position: "relative",
                  flex: "1",
                  minWidth: "[0]",
                })}
              >
                <FlowCanvas
                  mode={mode}
                  onInit={(fitView, zoom) => {
                    canvasControls.current = { fitView, zoom };
                  }}
                />
                <FlowToolbar
                  mode={mode}
                  onMode={setMode}
                  addNodeRef={addNodeRef}
                  pickerOpen={ui.picker?.anchor === "toolbar"}
                  onAddNode={() =>
                    setUiState((current) => ({
                      ...current,
                      picker: current.picker ? null : { anchor: "toolbar" },
                    }))
                  }
                  onOrganize={() => {
                    setDocumentState((current) => organize(current));
                    setTimeout(() => canvasControls.current?.fitView(), 60);
                  }}
                />
                <AddNodePicker toolbarAnchor={addNodeRef} />
                {session ? (
                  <TaskCard
                    session={session}
                    onDone={finishTask}
                    onReopenBriefing={reopenBriefing}
                    onClose={() => setSession(null)}
                  />
                ) : null}
              </div>
              <PropertiesPanel />
            </ReactFlowProvider>
          </main>
          {ui.runOpen ? <RunDialog /> : null}
          {briefingOpen ? (
            <Briefing
              onClose={() => {
                markBriefingSeen();
                setBriefingOpen(false);
              }}
            />
          ) : null}
        </div>
      </EditorContext>
    </PortalContainerContext>
  );
};

const screensStyle = css({
  minHeight: "[100vh]",
  backgroundColor: "neutral.s15",
  padding: "8",
  fontFamily: "body",
  color: "neutral.s120",
});

/**
 * Every screen side by side, in labelled rows of two, each a live copy of the editor in its starting state.
 */
export const Screens = () => {
  const rows = [...new Set(screenStates.map((state) => state.row))];
  const base = `${globalThis.location.pathname}`;
  return (
    <div className={`${screensStyle} petrinaut-root`}>
      <h1
        className={css({
          fontSize: "xl",
          fontWeight: "semibold",
          marginBottom: "1",
        })}
      >
        Flows editor prototype · screens
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "neutral.s100",
          marginBottom: "6",
        })}
      >
        Each frame is the live editor. Open one to click through it.
      </p>
      {rows.map((row) => (
        <section key={row} className={css({ marginBottom: "8" })}>
          <h2
            className={css({
              fontSize: "sm",
              fontWeight: "semibold",
              textTransform: "uppercase",
              letterSpacing: "[0.04em]",
              color: "neutral.s90",
              marginBottom: "3",
            })}
          >
            {row}
          </h2>
          <div
            className={css({
              display: "grid",
              gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
              gap: "6",
            })}
          >
            {screenStates
              .filter((state) => state.row === row)
              .map((state) => (
                <figure key={state.id} className={css({ margin: "[0]" })}>
                  <div
                    className={css({
                      position: "relative",
                      width: "[100%]",
                      aspectRatio: "[1440 / 900]",
                      overflow: "hidden",
                      borderRadius: "lg",
                      borderWidth: "thin",
                      borderStyle: "solid",
                      borderColor: "neutral.s40",
                      backgroundColor: "neutral.s00",
                    })}
                  >
                    <iframe
                      title={state.title}
                      src={`${base}?state=${state.id}`}
                      loading="lazy"
                      className={css({
                        position: "absolute",
                        top: "[0]",
                        left: "[0]",
                        width: "[1440px]",
                        height: "[900px]",
                        border: "[0]",
                        transformOrigin: "[0 0]",
                        // A static preview: the title link opens the live screen.
                        pointerEvents: "none",
                      })}
                      style={{ transform: "scale(var(--frame-scale, 0.45))" }}
                    />
                  </div>
                  <figcaption
                    className={css({
                      display: "flex",
                      alignItems: "baseline",
                      gap: "2",
                      marginTop: "2",
                    })}
                  >
                    <a
                      href={`${base}?state=${state.id}`}
                      className={css({
                        fontSize: "sm",
                        fontWeight: "semibold",
                        color: "blue.s100",
                      })}
                    >
                      {state.title}
                    </a>
                    <span
                      className={css({ fontSize: "sm", color: "neutral.s100" })}
                    >
                      {state.caption}
                    </span>
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
};
