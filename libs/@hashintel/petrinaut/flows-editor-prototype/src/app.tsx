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
import { mockRuns, runStatus } from "./mock-runs";
import { PropertiesPanel } from "./properties-panel";
import { RunForm } from "./run-dialogs";
import { validateDocument } from "./shapes";
import { findTask, newSession, type TaskSession, writeSession } from "./tasks";
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
  paddingY: "1",
  paddingRight: "1.5",
  paddingLeft: "1.5",
  // The breadcrumb puts 6 px after the back button (the bar's own gap is 12); the field's 6 px padding sits in it.
  marginLeft: "[-12px]",
  fieldSizing: "content",
  minWidth: "[40px]",
  maxWidth: "[480px]",
  outline: "none",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  // J0.4: while renamed, the name sits in a 298 px grey field, with no ring.
  "&:focus, &[data-editing]": {
    backgroundColor: "neutral.bg.surface.active",
    minWidth: "[298px]",
  },
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

/** The run banner: a white card at the top of the canvas, centred, with Back to editing at its end. */
const runBannerStyle = css({
  position: "absolute",
  top: "5",
  left: "[50%]",
  transform: "[translateX(-50%)]",
  zIndex: "[6]",
  display: "flex",
  alignItems: "center",
  gap: "3",
  paddingY: "1",
  paddingLeft: "3.5",
  paddingRight: "1",
  textStyle: "sm",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.08)]",
});

/** Simulate (J4.4): the DS outline sm button, its label muted, after Start's 14 px grey play tile. */
const simulateStyle = css({
  "&[class]": { color: "neutral.fg.muted.hover" },
});

/** Start's play glyph on its 14 px grey tile (D19 A tile · Start), as Simulate shows it. */
const StartGlyph = () => (
  <span
    className={css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "[14px]",
      height: "[14px]",
      borderRadius: "[3px]",
      backgroundColor: "neutral.bgSolid.surface.active",
      color: "neutral.fg.muted",
      "& svg": { width: "[10px]", height: "[10px]", "--icon-size": "10px" },
    })}
  >
    <Icon name="play" size="xs" />
  </span>
);

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
  onArchive,
}: {
  initialDocument: EditorDocument;
  initialUi: EditorUi;
  showBriefing?: boolean;
  initialTaskId?: number | null;
  /** Back to the flows list, handing it the flow as it is now. */
  onBack?: (document: EditorDocument) => void;
  /** ⋮ › Archive: the flow leaves the list. */
  onArchive?: (document: EditorDocument) => void;
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
  const runRef = useRef<HTMLSpanElement>(null);
  const canvasControls = useRef<{
    fitView: () => void;
    zoom: (by: number) => void;
  } | null>(null);

  const viewedRun = ui.viewRunId
    ? mockRuns(document).find((run) => run.id === ui.viewRunId)
    : undefined;
  const validation = validateDocument(document);
  const errorCount =
    validation.flowLevel.filter((diagnostic) => diagnostic.severity === "error")
      .length +
    [...validation.byStep.values()]
      .flat()
      .filter((diagnostic) => diagnostic.severity === "error").length +
    validation.incomplete.size;
  const mockCount = validation.mockFields.size;
  // J4.4: Run only when the flow can be started by hand. The mock has no manual trigger kind yet.
  const hasManualStart = false;
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
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "3",
                flex: "1",
                minWidth: "[0]",
              })}
            >
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
                data-flow-name
                onBlur={(event) => {
                  event.currentTarget.removeAttribute("data-editing");
                }}
                onChange={(event) => {
                  const name = event.target.value;
                  setDocumentState((current) => ({ ...current, name }));
                }}
              />
            </div>
            <div
              className={css({
                flex: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "2",
              })}
            >
              {/* Run shows only when the flow can be started by hand; no trigger kind does that yet. */}
              {hasManualStart ? (
                <Button
                  size="sm"
                  variant="subtle"
                  tone="neutral"
                  className={simulateStyle}
                >
                  Run
                </Button>
              ) : null}
              {/* Simulate: a dry run without the trigger. Its form opens under it. */}
              <span ref={runRef} className={css({ display: "inline-flex" })}>
                <Button
                  size="sm"
                  variant="subtle"
                  tone="neutral"
                  className={simulateStyle}
                  prefix={<StartGlyph />}
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
                  Simulate
                </Button>
              </span>
              <Button size="sm" variant="solid" tone="neutral">
                Publish
              </Button>
              {/* J0.12 (2 Nov): flows are archived, never deleted, so ⋮ holds Archive only. */}
              <Menu
                position="bottom-end"
                className={css({ minWidth: "[208px]" })}
                items={[
                  {
                    id: "archive",
                    text: "Archive",
                    onClick: () => (onArchive ?? onBack)?.(document),
                  },
                ]}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    iconName="ellipsisVertical"
                    className={cx(barButtonStyle, squareStyle)}
                    aria-label="More"
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
                {viewedRun ? (
                  // Option F (Explorations 903:39224): the run picked in Runs, on the same canvas.
                  <div className={runBannerStyle} role="status">
                    <span className={css({ fontWeight: "medium" })}>
                      Run · {viewedRun.when}
                    </span>
                    <span
                      className={css({
                        color: viewedRun.failedAt
                          ? "red.fg.body"
                          : "green.fg.body",
                      })}
                    >
                      {runStatus(viewedRun)}
                    </span>
                    <Button
                      size="sm"
                      variant="subtle"
                      tone="neutral"
                      onClick={() =>
                        setUiState((current) => ({
                          ...current,
                          viewRunId: null,
                          leftPanel: "steps",
                        }))
                      }
                    >
                      Back to editing
                    </Button>
                  </div>
                ) : null}
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
          {ui.runOpen ? <RunForm anchor={runRef} /> : null}
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
