import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Icon,
  Menu,
  PortalContainerContext,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { AddNodePicker } from "./add-node-picker";
import { Briefing, markBriefingSeen, TaskCard } from "./briefing";
import { FlowCanvas } from "./canvas";
import { EditorContext, type EditorUi } from "./editor-context";
import { LeftPanel } from "./left-panel";
import { PropertiesPanel } from "./properties-panel";
import { RunDialog } from "./run-dialogs";
import { validateDocument } from "./shapes";
import { journeyTitles, screenStates } from "./states";
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
  backgroundColor: "neutral.bgSolid.surface",
  fontFamily: "body",
  color: "neutral.fg.heading",
});

/** The DS topBar on ↳ Current: 64 px, 16 px in, near-white, a faint hairline under it. */
const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[64px]",
  paddingX: "4",
  backgroundColor: "neutral.bgSolid.min.hover",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  flexShrink: 0,
});

/** The breadcrumb's back button: 24 px, white, a hairline and 6 px corners, a 12 px arrow. */
const backStyle = css({
  "&[class]": {
    width: "[24px]",
    height: "[24px]",
    minWidth: "[24px]",
    padding: "[0]",
    justifyContent: "center",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.solid",
    borderRadius: "md",
    color: "neutral.fg.heading",
  },
  "&[class] svg": { width: "[12px]", height: "[12px]" },
});

/** The flow name, as the breadcrumb's text (14 px medium), editable in place. */
const titleInputStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderRadius: "sm",
  paddingY: "0.5",
  paddingRight: "1",
  paddingLeft: "[0]",
  // The breadcrumb puts 6 px after the back button; the bar's own gap is 12.
  marginLeft: "[-6px]",
  fieldSizing: "content",
  minWidth: "[40px]",
  maxWidth: "[480px]",
  outline: "none",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  _focusVisible: { boxShadow: "[0 0 0 2px var(--colors-blue-bd-subtle)]" },
});

/** The top bar's 32 px bordered buttons (Run and ⋮), as the DS IconButton draws them. */
const barButtonStyle = css({
  "&[class]": {
    height: "[32px]",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.solid",
    borderRadius: "lg",
    color: "neutral.fg.muted",
  },
  "&[class]:hover": { backgroundColor: "neutral.bgSolid.surface.hover" },
});

/** Run: 28 px, 14 px regular text after a 14 px play icon. */
const runStyle = css({
  "&[class]": { height: "[28px]", fontWeight: "normal", paddingX: "2" },
  "&[class] svg": { width: "[14px]", height: "[14px]" },
});

const squareStyle = css({
  "&[class]": {
    width: "[32px]",
    minWidth: "[32px]",
    padding: "[0]",
    justifyContent: "center",
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
              size="xs"
              variant="ghost"
              iconName="arrowLeft"
              className={backStyle}
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
                gap: "3",
              })}
            >
              {/* A small way to every screen state (?screens), for walking a reviewer through. */}
              <a
                href="?screens"
                className={css({
                  textStyle: "xs",
                  color: "neutral.fg.subtle",
                  marginRight: "2",
                  _hover: {
                    color: "neutral.fg.heading",
                    textDecoration: "underline",
                  },
                })}
              >
                All screens
              </a>
              <Button
                size="sm"
                variant="ghost"
                className={cx(barButtonStyle, runStyle)}
                prefix={<Icon name="play" size="sm" />}
                tooltip={
                  errorCount > 0
                    ? allMessages.slice(0, 6).join(" · ") ||
                      "Some steps are not set up yet"
                    : mockCount > 0
                      ? `The engine's validator finds no errors, but ${mockCount} fields hold values it can't represent yet.`
                      : "The engine's validator finds no errors"
                }
                onClick={() =>
                  setUiState((current) => ({ ...current, runOpen: true }))
                }
              >
                Run
              </Button>
              <Menu
                items={[
                  {
                    id: "status",
                    text:
                      errorCount > 0
                        ? `${errorCount} to fix`
                        : mockCount > 0
                          ? `Ready · ${mockCount} mock`
                          : "Ready",
                    icon: errorCount > 0 ? "warning" : "circleCheck",
                    tone: errorCount > 0 ? "error" : "neutral",
                    disabled: true,
                    onClick: () => undefined,
                  },
                  {
                    id: "tasks",
                    label: "Test tasks",
                    items: tasks.map((task) => ({
                      id: String(task.id),
                      text: `Task ${task.id}`,
                      onClick: () => startTask(task.id),
                    })),
                  },
                  {
                    id: "about",
                    text: "About this prototype",
                    icon: "info",
                    onClick: reopenBriefing,
                  },
                ]}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    iconName="ellipsisVertical"
                    className={cx(barButtonStyle, squareStyle)}
                    aria-label="More"
                    tooltip="More"
                  />
                }
              />
            </div>
          </header>
          <main
            className={css({
              position: "relative",
              display: "flex",
              flex: "1",
              minHeight: "[0]",
            })}
          >
            <ReactFlowProvider>
              <LeftPanel />
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
  backgroundColor: "neutral.bgSolid.surface.hover",
  padding: "8",
  fontFamily: "body",
  color: "neutral.fg.heading",
});

/** One screen: a live, scaled copy of the editor in that state, with its name linking to it. */
const ScreenFrame = ({
  state,
  base,
}: {
  state: (typeof screenStates)[number];
  base: string;
}) => (
  <figure className={css({ margin: "[0]" })}>
    <div
      className={css({
        position: "relative",
        width: "[100%]",
        aspectRatio: "[1440 / 900]",
        overflow: "hidden",
        borderRadius: "lg",
        borderWidth: "thin",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
        backgroundColor: "neutral.bgSolid.min",
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
          textStyle: "sm",
          fontWeight: "semibold",
          color: "blue.fg.muted",
        })}
      >
        {state.title}
      </a>
      <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
        {state.caption}
      </span>
    </figcaption>
  </figure>
);

/**
 * Every screen side by side, in labelled rows of two, each a live copy of the editor in its starting state.
 */
export const Screens = () => {
  // Grouped by Figma journey, in ↳ Current's order; within a journey, the states' own rows.
  const journeys = ([1, 2, 3, 4] as const).filter((journey) =>
    screenStates.some((state) => state.journey === journey),
  );
  const base = `${globalThis.location.pathname}`;
  return (
    <div className={`${screensStyle} petrinaut-root`}>
      <h1
        className={css({
          textStyle: "xl",
          fontWeight: "semibold",
          marginBottom: "1",
        })}
      >
        Flows editor prototype · screens
      </h1>
      <p
        className={css({
          textStyle: "sm",
          color: "neutral.fg.muted",
          marginBottom: "6",
        })}
      >
        Each frame is the live editor. Open one to click through it.
      </p>
      {journeys.map((journey) => (
        <section key={journey} className={css({ marginBottom: "10" })}>
          <h2
            className={css({
              textStyle: "lg",
              fontWeight: "semibold",
              color: "neutral.fg.heading",
              marginBottom: "4",
            })}
          >
            {journeyTitles[journey]}
          </h2>
          {[
            ...new Set(
              screenStates
                .filter((state) => state.journey === journey)
                .map((state) => state.row),
            ),
          ].map((row) => (
            <div key={row} className={css({ marginBottom: "6" })}>
              <h3
                className={css({
                  textStyle: "xs",
                  fontWeight: "medium",
                  color: "neutral.fg.subtle",
                  marginBottom: "2",
                })}
              >
                {row}
              </h3>
              <div
                className={css({
                  display: "grid",
                  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
                  gap: "6",
                })}
              >
                {screenStates
                  .filter(
                    (state) => state.journey === journey && state.row === row,
                  )
                  .map((state) => (
                    <ScreenFrame key={state.id} state={state} base={base} />
                  ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};
