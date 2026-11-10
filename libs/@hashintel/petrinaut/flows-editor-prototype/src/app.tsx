import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Menu,
  PortalContainerContext,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { AddNodePicker } from "./add-node-picker";
import { AllRuns } from "./all-runs";
import { updateDocument, useAppState } from "./app-store";
import { Briefing, markBriefingSeen, TaskCard } from "./briefing";
import { FlowCanvas } from "./canvas";
import { EditorContext, type EditorUi } from "./editor-context";
import { flowTriggersOf } from "./flow-triggers";
import {
  ForEachInstanceScope,
  forEachSwitchTake,
  ForEachTopSwitch,
} from "./foreach-switch";
import {
  HistoryContext,
  RunStepPanel,
  useHistory,
  useRunKeys,
} from "./history-view";
import { HashShellStrip } from "./hash-shell";
import { LeftPanel } from "./left-panel";
import { mockRuns, runStatus } from "./mock-runs";
import { needsReviewTake, ReviewSide } from "./needs-review";
import { ReviewR2Side } from "./needs-review-r2";
import { PropertiesPanel } from "./properties-panel";
import { navigate, routePath, setQuery, useLocation } from "./router";
import { RunForm } from "./run-dialogs";
import { RunLogPanel } from "./run-log-panel";
import {
  editorBarVariant,
  HistoryButton,
  RunTopBar,
  runBackTake,
  runBarTake,
  runBarVariant,
} from "./run-top-bar";
import { validateDocument } from "./shapes";
import { findTask, newSession, type TaskSession, writeSession } from "./tasks";
import { FlowToolbar, isTyping, organize } from "./toolbar";
import { InlineRename, Toast } from "./ui";
import {
  DraftSaveNote,
  PublishButton,
  VersionBanner,
  VersionButton,
} from "./versions";

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
    width: "[28px]",
    height: "[28px]",
    minWidth: "[28px]",
    padding: "[0]",
    justifyContent: "center",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.solid",
    borderRadius: "lg",
    color: "neutral.fg.heading",
  },
  "&[class] svg": { width: "[16px]", height: "[16px]" },
});

/** The flow title: renamed in place (Aakarsh, 4 Nov: Attio's pattern, no pen). */
const FlowTitle = ({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) => <InlineRename value={name} onSave={onRename} label="Flow name" />;

/** Editor take 3's muted line: the version menu, a dot, and the run count. */
const versionLineStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
  color: "neutral.fg.subtle",
});

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
    height: "[28px]",
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

const squareStyle = css({
  "&[class]": {
    width: "[28px]",
    minWidth: "[28px]",
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
  // Versions (V0–V7): the routed flow's draft and published versions; `?version=4` opens v4 read-only (V6).
  const version = flowId
    ? appState.flows.find((flow) => flow.id === flowId)?.meta.version
    : undefined;
  const asked = Number(location.query.get("version"));
  const viewingVersion =
    version?.published.some((entry) => entry.n === asked) &&
    !(version.state === "live" && version.current === asked)
      ? asked
      : null;
  const [notice, setNotice] = useState<string | null>(null);
  const liveRunId =
    history?.runs.find((run) => run.kind === "live" && !run.stopped)?.id ??
    null;
  const editorBar = editorBarVariant(location.query);
  // J6: History for a flow with runs. Without them (every other flow), History opens the older mock run view.
  const inHistory = Boolean(history && ui.history);
  const openRun = inHistory ? history?.run : null;
  useRunKeys(history, Boolean(openRun));
  // Esc with a step selected clears the selection, in the editor and in a run; with nothing selected it does nothing.
  const hasSelection =
    Boolean(ui.selectedId) || (ui.selectedIds?.length ?? 0) > 0;
  const escapeBusy = Boolean(ui.picker || ui.openField || ui.canvasMenu);
  useEffect(() => {
    if (!hasSelection || escapeBusy) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isTyping(event.target) ||
        globalThis.document.querySelector(
          "[role=menu], [role=dialog], [role=listbox]",
        )
      ) {
        return;
      }
      setUiState((current) => ({
        ...current,
        selectedId: null,
        selectedIds: [],
      }));
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [hasSelection, escapeBusy]);
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
  // V5: the steps that keep the draft from running (each counted once), plus flow-level errors.
  const problemCount =
    new Set([
      ...[...validation.byStep.entries()]
        .filter(([, diagnostics]) =>
          diagnostics.some((diagnostic) => diagnostic.severity === "error"),
        )
        .map(([stepId]) => stepId),
      ...validation.incomplete,
    ]).size +
    validation.flowLevel.filter((diagnostic) => diagnostic.severity === "error")
      .length;
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
          <div
            ref={portalRef}
            className={`${rootStyle} petrinaut-root`}
            data-run-tiles={
              ui.history &&
              new URLSearchParams(globalThis.location.search).get(
                "runtiles",
              ) !== "pa"
                ? true
                : undefined
            }
          >
            <HashShellStrip />
            <div className={workspaceStyle}>
              <header className={topBarStyle}>
                {openRun && history ? (
                  <RunTopBar
                    variant={runBarVariant(location.query)}
                    back={runBackTake(location.query)}
                    take={runBarTake(location.query)}
                    onFlows={onBack ? () => onBack(document) : undefined}
                    forEachSwitch={
                      forEachSwitchTake(location.query) === "top" ? (
                        <ForEachTopSwitch />
                      ) : undefined
                    }
                    history={history}
                    flowName={document.name}
                    onEditor={toEditor}
                    onSimulate={() => {
                      toEditor();
                      setUiState((current) => ({ ...current, runOpen: true }));
                    }}
                  />
                ) : (
                  <>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "3",
                        flex: "1",
                        minWidth: "[0]",
                      })}
                    >
                      {
                        <>
                          {/* Without the switch (takes 2, 3), ← on All runs goes back to the editor. */}
                          {inHistory && editorBar !== 1 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              iconName="arrowLeft"
                              className={backStyle}
                              aria-label="Back to the editor"
                              tooltip="Back to the editor"
                              onClick={toEditor}
                            />
                          ) : (
                            <Button
                              size="sm"
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
                              setDocumentState((current) => ({
                                ...current,
                                name,
                              }))
                            }
                          />
                          {version && editorBar !== 3 ? (
                            <VersionButton
                              version={version}
                              viewing={viewingVersion}
                            />
                          ) : null}
                          {version && viewingVersion === null ? (
                            <DraftSaveNote document={document} />
                          ) : null}
                          {/* Take 3: one muted line, "v6 · Draft ▾ · 17 runs"; each part opens its own place. */}
                          {version && editorBar === 3 ? (
                            <span className={versionLineStyle}>
                              <VersionButton
                                version={version}
                                viewing={viewingVersion}
                              />
                              <span aria-hidden>·</span>
                              <HistoryButton
                                variant="link"
                                runCount={history?.runs.length ?? 0}
                                onOpen={() => history?.open(null)}
                              />
                            </span>
                          ) : null}
                        </>
                      }
                    </div>
                    {/*
                  History is selected on All runs and the older run view. Inside a J6 run the top bar is minimal
                  (Aakarsh, 4 Nov): no switch; All runs and Return to editor are the ways back.
                */}
                    <div
                      className={viewSwitchStyle}
                      style={editorBar === 1 ? undefined : { display: "none" }}
                    >
                      <SegmentedControl<"editor" | "history">
                        size="md"
                        className={viewSwitchSizeStyle}
                        aria-label="Flow view"
                        items={[
                          { value: "editor", label: "Editor" },
                          {
                            value: "history",
                            label: "Logs",
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
                      {/* T1 (4 Nov): Simulate, Run, Publish, ⋮. */}
                      <>
                        {editorBar === 2 ? (
                          <HistoryButton
                            variant="button"
                            runCount={history?.runs.length ?? 0}
                            onOpen={() => history?.open(null)}
                          />
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
                            iconName="flask"
                            tooltip={
                              errorCount > 0
                                ? allMessages.slice(0, 6).join(" · ") ||
                                  "Some steps are not set up yet"
                                : mockCount > 0
                                  ? `The engine's validator finds no errors, but ${mockCount} fields hold values it can't represent yet.`
                                  : "The engine's validator finds no errors"
                            }
                            onClick={() =>
                              setUiState((current) => ({
                                ...current,
                                runOpen: true,
                              }))
                            }
                          >
                            Simulate
                          </Button>
                        </span>
                        {/*
                    T1 (4 Nov) always has Run. It starts a live run and opens it; it is off while manual runs are off
                    in the flow's Triggers panel (the 14 Oct rule was "Run only when a manual start is allowed").
                  */}
                        <Button
                          size="sm"
                          variant="subtle"
                          tone="neutral"
                          className={simulateStyle}
                          iconName="play"
                          disabled={!hasManualStart}
                          tooltip={
                            hasManualStart
                              ? "Start a run now"
                              : "Manual runs are off for this flow. Turn them on in Triggers."
                          }
                          onClick={() => history?.start()}
                        >
                          Run
                        </Button>
                        {version ? (
                          <PublishButton
                            flowId={flowId}
                            version={version}
                            problems={problemCount}
                            viewing={viewingVersion}
                            liveRun={liveRunId}
                          />
                        ) : (
                          <Button size="sm" variant="solid" tone="neutral">
                            Publish
                          </Button>
                        )}
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
                      </>
                    </div>
                  </>
                )}
              </header>
              {notice ? (
                <Toast text={notice} onDone={() => setNotice(null)} />
              ) : null}
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
                    <LeftPanel
                      statusFor={(stepId) =>
                        history.steps?.[stepId] ?? { state: "notReached" }
                      }
                    />
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
                    {version && viewingVersion !== null && !inHistory ? (
                      <VersionBanner
                        version={version}
                        viewing={viewingVersion}
                        onRestore={() => {
                          setQuery("version", null);
                          // MOCK: restoring copies nothing yet; the draft stays as it is.
                          setNotice(
                            `Restored v${viewingVersion} into the v${version.state === "draft" ? version.current : version.current + 1} draft`,
                          );
                        }}
                      />
                    ) : null}
                    <ForEachInstanceScope>
                      <FlowCanvas
                        flowId={flowId}
                        mode={mode}
                        onInit={(fitView, zoom) => {
                          canvasControls.current = { fitView, zoom };
                        }}
                      />
                    </ForEachInstanceScope>
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
                    {viewedRun ? (
                      // Option F (Explorations 903:39224): the run picked in History, on the same canvas.
                      <div className={runBannerStyle} role="status">
                        <span className={css({ fontWeight: "medium" })}>
                          Run · {viewedRun.when}
                        </span>
                        <span
                          className={css({
                            color: viewedRun.failedAt
                              ? "[var(--flows-failed-text)]"
                              : "[var(--flows-done-text)]",
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
                      // A selected step shows its outputs; otherwise the run's log (minimal log, 4 Nov).
                      needsReviewTake?.startsWith("r2-") ? (
                        // ?needsreview=r2-1..r2-4: list, context and form at once (round 2, 9 Nov sync).
                        <ReviewR2Side>
                          {ui.selectedId ? (
                            <RunStepPanel history={history} />
                          ) : (
                            <RunLogPanel history={history} />
                          )}
                        </ReviewR2Side>
                      ) : (
                        <ReviewSide>
                          {ui.selectedId ? (
                            <RunStepPanel history={history} />
                          ) : (
                            <RunLogPanel history={history} />
                          )}
                        </ReviewSide>
                      )
                    ) : null
                  ) : viewingVersion === null ? (
                    <PropertiesPanel />
                  ) : null}
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
