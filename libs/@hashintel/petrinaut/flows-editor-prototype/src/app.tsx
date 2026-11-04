import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  Avatar,
  Button,
  Icon,
  Menu,
  PortalContainerContext,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { AddNodePicker } from "./add-node-picker";
import { AllRuns } from "./all-runs";
import { updateDocument, useAppState } from "./app-store";
import workspaceAvatar from "./assets/workspace-avatar.png";
import { Briefing, markBriefingSeen, TaskCard } from "./briefing";
import { FlowCanvas } from "./canvas";
import { EditorContext, type EditorUi } from "./editor-context";
import { flowTriggersOf } from "./flow-triggers";
import {
  AllRunsButton,
  HistoryContext,
  RunBanner,
  RunStepList,
  RunStepPanel,
  RunSwitcher,
  useHistory,
  useRunKeys,
} from "./history-view";
import { LeftPanel } from "./left-panel";
import { mockRuns, runStatus } from "./mock-runs";
import { PropertiesPanel } from "./properties-panel";
import { navigate, routePath, setQuery, useLocation } from "./router";
import { RunForm } from "./run-dialogs";
import { RunLog, RunViewSwitch } from "./run-log";
import { validateDocument } from "./shapes";
import { findTask, newSession, type TaskSession, writeSession } from "./tasks";
import { FlowToolbar, organize } from "./toolbar";

import type { EditorDocument } from "./document";

const rootStyle = css({
  position: "relative",
  display: "flex",
  height: "[100vh]",
  width: "[100vw]",
  backgroundColor: "neutral.bgSolid.surface",
  fontFamily: "body",
  color: "neutral.fg.heading",
});

/** Everything right of the HASH sidebar strip: the top bar over the panels and canvas. */
const workspaceStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
});

/**
 * The HASH app's sidebar, closed (3 Nov layout; hash-frontend): a 42 px white strip down the whole left edge with a
 * hairline on its right, the workspace avatar 16 px down, and the open-sidebar arrow 12 px under it.
 */
const hashStripStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "3",
  flexShrink: 0,
  width: "[42px]",
  height: "[100%]",
  paddingTop: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

const HashSidebarStrip = () => (
  <nav className={hashStripStyle} aria-label="HASH">
    <Avatar
      size="xs"
      shape="square"
      src={workspaceAvatar}
      alt="Workspace"
      placeholder={{ initials: "AT" }}
    />
    {/* The prototype has no HASH sidebar to open. */}
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconName="arrowRight"
      aria-label="Open sidebar"
    />
  </nav>
);

/** The DS topBar on ↳ Current: 64 px, 16 px in, near-white, a faint hairline under it. */
const topBarStyle = css({
  position: "relative",
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
/**
 * The flow title as Figma's DS ToggleableTextInput (3 Nov): the name with a pen right after it, 8 px after the back
 * button. Hover adds the pale fill; the name or the pen opens it for editing in place.
 *
 * DS gap: ds-components has no ToggleableTextInput. This is the smallest equivalent: the DS ghost xs Button for the
 * pen, and a plain input for the edit state.
 */
const titleBoxStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "[2px]",
  height: "[28px]",
  paddingLeft: "2",
  paddingRight: "[2px]",
  // The bar's gap is 12 px; the box starts 8 px after the back button.
  marginLeft: "[-4px]",
  borderRadius: "lg",
  minWidth: "[0]",
  cursor: "text",
  _hover: { backgroundColor: "neutral.bgSolid.surface.active" },
});

/** Figma's pen: the DS ghost IconButton at xs, 24 px square. */
const penStyle = css({
  "&[class]": {
    width: "[24px]",
    height: "[24px]",
    minWidth: "[24px]",
    padding: "[0]",
    justifyContent: "center",
  },
});

const titleTextStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "[480px]",
});

/** J0.4: while renamed, the name sits in a 301 px pale field with the caret, no ring. */
const titleInputStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  height: "[28px]",
  backgroundColor: "neutral.bgSolid.surface.active",
  borderWidth: "[0]",
  borderRadius: "lg",
  paddingX: "2",
  marginLeft: "[-4px]",
  fieldSizing: "content",
  minWidth: "[301px]",
  maxWidth: "[480px]",
  outline: "none",
});

const FlowTitle = ({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className={titleInputStyle}
        value={name}
        aria-label="Flow name"
        data-flow-name
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the user asked to rename; the caret goes to the name
        autoFocus
        onFocus={(event) =>
          event.currentTarget.setSelectionRange(name.length, name.length)
        }
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        onChange={(event) => onRename(event.target.value)}
      />
    );
  }
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the pen is the keyboard way in
    <span className={titleBoxStyle} onClick={() => setEditing(true)}>
      <span className={titleTextStyle}>{name}</span>
      <Button
        size="xs"
        variant="ghost"
        iconName="pencil"
        className={penStyle}
        aria-label="Rename flow"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      />
    </span>
  );
};

/** Editor | History (3 Nov): the DS SegmentedControl at md, centred in the top bar (x 42 to 1440). */
const viewSwitchStyle = css({
  display: "flex",
  position: "absolute",
  top: "[50%]",
  left: "[50%]",
  transform: "[translate(-50%, -50%)]",
});

/**
 * DS gap: code's SegmentedControl md is 34 px with 10 px item padding; Figma's md is 32 px with 6 px. These two
 * variables bring it to Figma's size: 28 px items, 6 px in.
 */
const viewSwitchSizeStyle = css({
  "&[class]": { "--sc-item-px": "6px", "--form-padding-y": "3px" },
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
  flowId,
  opened,
}: {
  /** A routed flow (`/flows/:flowId`): its document lives in the app store, and the URL says which run is open. */
  flowId?: string;
  /** From the URL: History's run list (`runId: null`) or one run; nothing in the editor. */
  opened?: EditorUi["history"];
  initialDocument: EditorDocument;
  initialUi: EditorUi;
  showBriefing?: boolean;
  initialTaskId?: number | null;
  /** Back to the flows list, handing it the flow as it is now. */
  onBack?: (document: EditorDocument) => void;
  /** ⋮ › Archive: the flow leaves the list. */
  onArchive?: (document: EditorDocument) => void;
}) => {
  const appState = useAppState();
  const stored = flowId
    ? appState.flows.find((flow) => flow.id === flowId)?.document
    : undefined;
  const [localDocument, setLocalDocument] = useState(initialDocument);
  const document = stored ?? localDocument;
  const setDocumentState = (
    update: (current: EditorDocument) => EditorDocument,
  ) => (flowId ? updateDocument(flowId, update) : setLocalDocument(update));
  const [uiState, setUiState] = useState(initialUi);
  const location = useLocation();
  const urlStep = location.query.get("step");
  // Back and Forward: the step in the URL is the step selected.
  const href = `${location.pathname}${location.search}`;
  const [seenHref, setSeenHref] = useState(href);
  if (flowId && href !== seenHref) {
    setSeenHref(href);
    if (urlStep !== uiState.selectedId) {
      setUiState((current) => ({
        ...current,
        selectedId: urlStep,
        selectedIds: urlStep ? [urlStep] : [],
      }));
    }
  }
  // The selected step goes into the URL (no new history entry), so a reload keeps it.
  const selectedId = uiState.selectedId;
  useEffect(() => {
    if (flowId) {
      setQuery("step", selectedId);
    }
  }, [flowId, selectedId]);
  const ui: EditorUi = flowId
    ? {
        ...uiState,
        history: opened ?? null,
        runLog: location.query.get("panel") === "log" ? true : uiState.runLog,
      }
    : uiState;
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

  const history = useHistory(flowId, ui.history, setUiState);
  // J6: History for a flow with runs. Without them (every other flow), History opens the older mock run view.
  const inHistory = Boolean(history && ui.history);
  const openRun = inHistory ? history?.run : null;
  useRunKeys(history, Boolean(openRun));
  const runs = mockRuns(document);
  const latestRun = runs[0];
  const viewedRun = ui.viewRunId
    ? runs.find((run) => run.id === ui.viewRunId)
    : undefined;
  const showingRun = Boolean(viewedRun) || ui.run === true;
  const validation = validateDocument(document);
  const errorCount =
    validation.flowLevel.filter((diagnostic) => diagnostic.severity === "error")
      .length +
    [...validation.byStep.values()]
      .flat()
      .filter((diagnostic) => diagnostic.severity === "error").length +
    validation.incomplete.size;
  const mockCount = validation.mockFields.size;
  // J4.4: Run only when the flow can be started by hand: manual runs are on in its Triggers panel.
  const hasManualStart = flowTriggersOf(document, ui.triggerSwitches).manual;
  const toEditor = () => {
    if (flowId) {
      navigate(routePath({ page: "editor", flowId }));
    }
    setUiState((current) => ({
      ...current,
      history: null,
      viewRunId: null,
      run: false,
      runLog: current.runLog === undefined ? undefined : false,
      selectedId: null,
      selectedIds: [],
    }));
  };
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
        <HistoryContext value={history}>
          <div ref={portalRef} className={`${rootStyle} petrinaut-root`}>
            <HashSidebarStrip />
            <div className={workspaceStyle}>
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
                  {openRun && history ? (
                    <AllRunsButton history={history} />
                  ) : (
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
                  )}
                  <FlowTitle
                    name={document.name}
                    onRename={(name) =>
                      setDocumentState((current) => ({ ...current, name }))
                    }
                  />
                  {openRun && history ? (
                    <>
                      <span
                        aria-hidden
                        className={css({
                          color: "neutral.fg.subtle",
                          marginX: "[-4px]",
                        })}
                      >
                        ›
                      </span>
                      <RunSwitcher history={history} />
                    </>
                  ) : null}
                </div>
                {/*
                  History is selected on All runs and the older run view. Inside a J6 run the top bar is minimal
                  (Aakarsh, 4 Nov): no switch; All runs and Return to editor are the ways back.
                */}
                <div
                  className={viewSwitchStyle}
                  style={openRun ? { display: "none" } : undefined}
                >
                  <SegmentedControl<"editor" | "history">
                    size="md"
                    className={viewSwitchSizeStyle}
                    aria-label="Flow view"
                    items={[
                      { value: "editor", label: "Editor" },
                      {
                        value: "history",
                        label: "History",
                        disabled: latestRun === undefined,
                      },
                    ]}
                    value={showingRun || inHistory ? "history" : "editor"}
                    onChange={(view) =>
                      history
                        ? view === "history"
                          ? history.open(null)
                          : toEditor()
                        : setUiState((current) => ({
                            ...current,
                            ...(view === "history"
                              ? {
                                  viewRunId: latestRun?.id ?? null,
                                  selectedId: null,
                                  selectedIds: [],
                                  picker: null,
                                  openField: null,
                                }
                              : { viewRunId: null, run: false }),
                          }))
                    }
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
                  {openRun ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      tone="neutral"
                      onClick={toEditor}
                    >
                      Return to editor
                    </Button>
                  ) : null}
                  {/* Simulate: a dry run without the trigger. Its form opens under it. */}
                  <span
                    ref={runRef}
                    className={css({ display: "inline-flex" })}
                  >
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
                  {/* Run shows only when the flow can be started by hand: it starts a live run and opens it. */}
                  {hasManualStart ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      tone="neutral"
                      className={simulateStyle}
                      iconName="play"
                      onClick={() => history?.start()}
                    >
                      Run
                    </Button>
                  ) : null}
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
                  {inHistory && history && !openRun ? (
                    <AllRuns history={history} />
                  ) : null}
                  {openRun && history ? (
                    <RunStepList history={history} />
                  ) : inHistory ? null : (
                    <LeftPanel />
                  )}
                  {/* The canvas and its floating parts, left of the docked panel (↳ Current: canvas, then a 420 panel). */}
                  <div
                    className={css({
                      position: "relative",
                      flex: "1",
                      minWidth: "[0]",
                    })}
                    style={
                      inHistory && !openRun ? { display: "none" } : undefined
                    }
                  >
                    {openRun && history && ui.runLog ? (
                      <RunLog history={history} />
                    ) : null}
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
                    {inHistory ? null : (
                      <AddNodePicker toolbarAnchor={addNodeRef} />
                    )}
                    {openRun && history ? (
                      <div
                        className={css({
                          position: "absolute",
                          top: "4",
                          left: "4",
                          zIndex: "[6]",
                          display: "flex",
                          alignItems: "center",
                          gap: "3",
                        })}
                      >
                        <RunViewSwitch history={history} />
                        <RunBanner history={history} />
                      </div>
                    ) : null}
                    {viewedRun ? (
                      // Option F (Explorations 903:39224): the run picked in History, on the same canvas.
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
                  {inHistory ? (
                    openRun && history ? (
                      <RunStepPanel history={history} />
                    ) : null
                  ) : (
                    <PropertiesPanel />
                  )}
                </ReactFlowProvider>
              </main>
            </div>
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
        </HistoryContext>
      </EditorContext>
    </PortalContainerContext>
  );
};
