/**
 * Top bar takes, for Aakarsh to pick from (4 Nov): "what's the most minimal version of the top bar we can do which is
 * still clear and like allows all the affordances". Minimal means fewer, quieter controls, never fewer functions.
 *
 * Run view (`?topbar=1..5`, from the URL only). No segmented control in any. Each has: back to the editor, all runs, the run
 * switcher (‹ › and the picker), Re-run (Stop on a live run), Simulate, Publish and ⋮. The takes differ only in
 * layout and grouping. A run with failed items adds "Re-run 2 failed" left of Re-run, its only place in the app.
 * 1. Centred switcher: ← flow · All runs | ‹ Run 16 · Today, 08:15 ▾ › | Re-run, Simulate, Publish, ⋮. The default.
 * 2. One control: [← flow / Run 16 ▾] ‹ ›, All runs first in the picker | Re-run, Simulate, Publish, ⋮.
 * 3. Breadcrumb: flow › All runs › ‹ Run 16 ▾ › | Re-run, Simulate, Publish, ⋮.
 * 4. Run as the title: ← History | Run 16 (big), "Failed · Today, 08:15", ‹ ▾ › | Re-run, Simulate, Open in editor,
 *    Publish, ⋮.
 * 5. Take 1 with one "Re-run ▾" menu: "Re-run everything" and "Only the 2 failed"; the count is in the item, not on
 *    the button. MOCK: the engine hasn't confirmed it can retry only the failed items yet.
 *
 * Editor: take 1, picked by Aakarsh on 4 Nov. The others stay for comparison behind `?editorbar=2|3`, which is not
 * remembered, so the default route always shows take 1.
 * 1. T1: the Editor | History segmented control, centred.
 * 2. History as a quiet ghost button, "17 runs", beside Simulate.
 * 3. One muted line by the title, "v6 · Draft ▾ · 17 runs".
 * Every take has the title (renamed in place) and the version menu (V0–V7).
 */
import { useState } from "react";

import {
  BreadCrumbs,
  Button,
  Menu,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type HistoryValue,
  pickerTimeStyle,
  RunSwitcher,
} from "./history-view";
import { cameFrom, navigate, parseRoute } from "./router";
import { RunGlyph } from "./run-glyph";
import {
  bannerAction,
  factsOf,
  outcomeOf,
  outcomeState,
  statusText,
} from "./run-history";
import { ConfirmDialog, useConfirmTake } from "./confirm-dialog";
import { runId, runIdMono, RunIdText, runLabel } from "./run-id";
import {
  liveTail,
  runTimeTake,
  shortTime,
  startedLine,
  startTime,
} from "./run-time";

export type RunBarVariant = 1 | 2 | 3 | 4 | 5;
export type EditorBarVariant = 1 | 2 | 3;

/** `?topbar=` from the URL only, never remembered; else take 1. */
export const runBarVariant = (query: URLSearchParams): RunBarVariant => {
  const take = Number(query.get("topbar"));
  return take === 2 || take === 3 || take === 4 || take === 5 ? take : 1;
};

/**
 * `?runback=` (6 Nov sync, B9): where the run's way back goes. URL only, never remembered.
 * - editor: "← Monthly supplier review" goes to the editor. The default.
 * - prev: back to where the run was opened from, named for it: "← Logs", "← All runs", "← Monthly supplier review".
 * - crumb: "Monthly supplier review › Logs › Run 17", each part a link and the run the picker.
 * - split: prev's back, plus "Open in editor" with the run's actions.
 */
export type RunBackTake = "editor" | "prev" | "crumb" | "split";

export const runBackTake = (query: URLSearchParams): RunBackTake => {
  const take = query.get("runback");
  return take === "prev" || take === "crumb" || take === "split"
    ? take
    : "editor";
};

/** Where the run was opened from; a run opened by link goes back to Logs. */
const backTarget = (flowName: string) => {
  const from = cameFrom();
  const page = from ? parseRoute(from, "").page : null;
  return page === "editor"
    ? { page, label: flowName }
    : page === "runs"
      ? { page, label: "All runs" }
      : { page: "history" as const, label: "Logs" };
};

/**
 * `?runbar=1..4` (10 Nov, run-back-control round 2): the run bar as one composition with the editor bar, not a back
 * control on its own. URL only; without it the bar is `?topbar=` / `?runback=` as before. Every take has the same
 * right side, "Re-run 2 failed", Re-run, ⋮, with Simulate and Publish moved into ⋮; they differ in where back goes.
 * 1. Take 1, balanced: the editor's ← (back where you came from) and the flow name in heading colour (to the
 *    editor) on the left; the run switcher stays centred.
 * 2. The editor's bar: ← to flows, the flow name, the run switcher in the version's place; Editor | Logs centred,
 *    with Logs on. The switch is the way back.
 * 3. Breadcrumb: Monthly supplier review › Logs › ‹ Run 2C07 ▾ ›; the crumbs are the way back. No centre.
 * 4. Run as the title: ← (back where you came from), then two lines, "Monthly supplier review › Logs" over the run
 *    and its status; ‹ ▾ › after.
 */
export type RunBarTake = 1 | 2 | 3 | 4;

export const runBarTake = (query: URLSearchParams): RunBarTake | null => {
  // Picked r2-2 (Aakarsh, 10 Nov 16:20): the editor's bar. ?runbar=today keeps the old bar.
  if (query.get("runbar") === "today") {
    return null;
  }
  const take = Number(query.get("runbar"));
  return take === 1 || take === 2 || take === 3 || take === 4 ? take : 2;
};

export const editorBarVariant = (query: URLSearchParams): EditorBarVariant => {
  const take = Number(query.get("editorbar"));
  return take === 2 || take === 3 ? take : 1;
};

const sideStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "1",
  minWidth: "[0]",
});

const rightStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
  flex: "1",
  // A crowded bar squeezes the way back on the left, never an action onto two lines.
  "& button": { whiteSpace: "nowrap" },
});

const centreStyle = css({
  display: "flex",
  alignItems: "center",
  position: "absolute",
  top: "[50%]",
  left: "[50%]",
  transform: "[translate(-50%, -50%)]",
});

/** The centre with the For each switcher beside the run switcher: too wide to float, so it takes its place in the row. */
const centreInRowStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
});

const flowLinkStyle = css({
  "&[class]": {
    fontWeight: "medium",
    color: "neutral.fg.subtle",
    paddingX: "1.5",
    maxWidth: "[320px]",
  },
  "&[class]:hover": { color: "neutral.fg.heading" },
});

const quietStyle = css({ "&[class]": { color: "neutral.fg.muted.hover" } });

const squareStyle = css({
  "&[class]": {
    width: "[28px]",
    height: "[28px]",
    minWidth: "[28px]",
    padding: "[0]",
    justifyContent: "center",
  },
});

const dotStyle = css({ color: "neutral.fg.subtle" });

/** Take 2's one control: a hairline group holding the way back and the run picker. */
const groupStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[32px]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "lg",
  overflow: "hidden",
  "& > button[class]": { height: "[30px]", borderRadius: "[0]" },
});

const groupDividerStyle = css({
  width: "[1px]",
  alignSelf: "stretch",
  backgroundColor: "neutral.bd.subtle",
});

const groupRunStyle = css({
  "&[class]": { fontWeight: "medium", color: "neutral.fg.heading" },
});

const runTitleStyle = css({
  textStyle: "lg",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
});

const runMetaStyle = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

/** `?runbar=` ←: the editor's back button (app.tsx `backStyle`), a 28 px hairline square with a 16 px arrow. */
const editorBackStyle = css({
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

/** `?runbar=` flow name: the editor title's 14 px medium heading colour, a faint fill on hover. */
const flowTitleStyle = css({
  "&[class]": {
    fontWeight: "medium",
    color: "neutral.fg.heading",
    paddingX: "1.5",
    maxWidth: "[320px]",
  },
});

const plainTitleStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "[320px]",
  paddingX: "1.5",
});

const leftGapStyle = css({ gap: "3" });

/** `?runtime=t3`: the run's start and length, faint, before the actions. */
const startedStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  paddingX: "1.5",
});

/** Take 4's two lines: the path to the run at 12 px over the run at 14 px. */
const stackStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "[1px]",
  minWidth: "[0]",
});

const pathLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  "& button": {
    all: "unset",
    cursor: "pointer",
    borderRadius: "sm",
  },
  "& button:hover": { color: "neutral.fg.heading" },
});

const runLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "sm",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

const runNameStyle = css({
  all: "unset",
  cursor: "pointer",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  borderRadius: "sm",
  "&:hover": { textDecoration: "underline", textDecorationColor: "neutral.bd.solid" },
});

const runStatusStyle = css({
  color: "neutral.fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** The status grammar (10 Nov): mark · Word · how many. */
const statusWord: Record<ReturnType<typeof outcomeOf>, string> = {
  running: "Running",
  needsReview: "Needs review",
  warnings: "Done",
  error: "Failed",
  completed: "Done",
  abandoned: "Cancelled",
};

/** ⋮ in a run under `?runbar=`: Simulate and Publish join the run's own items. MOCK: Download log and Delete run do nothing yet. */
const RunBarMoreMenu = ({ onSimulate }: { onSimulate: () => void }) => (
  <Menu
    position="bottom-end"
    className={css({ minWidth: "[208px]" })}
    items={[
      {
        id: "flow",
        label: "",
        items: [
          {
            id: "simulate",
            text: "Simulate with these inputs",
            icon: "flask",
            onClick: onSimulate,
          },
          {
            id: "publish",
            text: "Publish draft",
            icon: "arrowUp",
            onClick: () => undefined,
          },
        ],
      },
      {
        id: "run",
        label: "",
        items: [
          {
            id: "copy-link",
            text: "Copy run link",
            icon: "copy",
            onClick: () => {
              void globalThis.navigator.clipboard
                ?.writeText(globalThis.location.href)
                .catch(() => undefined);
            },
          },
          {
            id: "download-log",
            text: "Download log",
            icon: "download",
            onClick: () => undefined,
          },
          {
            id: "delete",
            text: "Delete run",
            icon: "trash",
            onClick: () => undefined,
          },
        ],
      },
    ]}
    trigger={
      <Button
        size="sm"
        variant="subtle"
        tone="neutral"
        iconName="ellipsisVertical"
        className={squareStyle}
        aria-label="More"
        data-run-more
      />
    }
  />
);

/** ⋮ in a run. MOCK: Download log and Delete run do nothing yet. */
const RunMoreMenu = () => (
  <Menu
    position="bottom-end"
    className={css({ minWidth: "[208px]" })}
    items={[
      {
        id: "copy-link",
        text: "Copy run link",
        icon: "copy",
        onClick: () => {
          void globalThis.navigator.clipboard
            ?.writeText(globalThis.location.href)
            .catch(() => undefined);
        },
      },
      {
        id: "download-log",
        text: "Download log",
        icon: "download",
        onClick: () => undefined,
      },
      {
        id: "delete",
        text: "Delete run",
        icon: "trash",
        onClick: () => undefined,
      },
    ]}
    trigger={
      <Button
        size="sm"
        variant="subtle"
        tone="neutral"
        iconName="ellipsisVertical"
        className={squareStyle}
        aria-label="More"
        data-run-more
      />
    }
  />
);

export const RunTopBar = ({
  variant,
  back = "editor",
  take = null,
  onFlows,
  forEachSwitch,
  history,
  flowName,
  onEditor,
  onSimulate,
}: {
  variant: RunBarVariant;
  back?: RunBackTake;
  /** `?runbar=`: round 2's whole-bar takes; null keeps `variant` and `back`. */
  take?: RunBarTake | null;
  /** The editor's ←: back to the flows list (take 2). */
  onFlows?: () => void;
  /** `?foreachswitch=top`: the For each item switcher, beside the run switcher. */
  forEachSwitch?: React.ReactNode;
  history: HistoryValue;
  flowName: string;
  onEditor: () => void;
  /** The editor, with Simulate open on this run's inputs. */
  onSimulate: () => void;
}) => {
  const { run, now } = history;
  // ?confirm=dialog: Stop asks first.
  const confirmTake = useConfirmTake();
  const [stopAsk, setStopAsk] = useState(false);
  if (!run) {
    return null;
  }
  const outcome = outcomeOf(run, now);
  const stop = bannerAction(run, now) === "Stop";
  const stopDialog = stopAsk ? (
    <ConfirmDialog
      title={`Stop run ${runId(run)}?`}
      body="Steps that are running are cancelled. Finished steps keep their outputs. A stopped run can't be resumed."
      action="Stop run"
      onClose={() => setStopAsk(false)}
      onConfirm={() => {
        setStopAsk(false);
        history.stop(run.id);
      }}
    />
  ) : null;
  const failedCount =
    outcome === "warnings" ? factsOf(run, now).failures.length : 0;
  // The one place to re-run only the failed items: just left of Re-run. Elsewhere it is plain "2 failed".
  const rerunFailedButton =
    failedCount > 0 ? (
      <Button
        size="sm"
        variant="subtle"
        tone="neutral"
        className={quietStyle}
        data-run-rerun-failed
        onClick={() => history.start(failedCount)}
      >
        {`Re-run ${failedCount} failed`}
      </Button>
    ) : null;
  const actionButton = (
    <>
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      iconName={stop ? "stop" : "rotate"}
      className={quietStyle}
      data-run-action
      onClick={() =>
        stop
          ? confirmTake === "dialog"
            ? setStopAsk(true)
            : history.stop(run.id)
          : history.start()
      }
    >
      {stop ? "Stop" : "Re-run"}
    </Button>
    {stopDialog}
    </>
  );
  const simulateButton = (
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      className={quietStyle}
      iconName="flask"
      tooltip="Open the editor and simulate with this run's inputs"
      onClick={onSimulate}
    >
      Simulate
    </Button>
  );
  // Take 5: one Re-run with both choices. MOCK: partial retry is not confirmed by the engine yet.
  const rerunMenu = (
    <Menu
      position="bottom-end"
      className={css({ minWidth: "[208px]" })}
      items={[
        {
          id: "rerun-all",
          text: "Re-run everything",
          icon: "rotate",
          onClick: () => history.start(),
        },
        {
          id: "rerun-failed",
          text: `Only the ${failedCount} failed`,
          icon: "rotate",
          onClick: () => history.start(failedCount),
        },
      ]}
      trigger={
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          iconName="chevronDown"
          iconPosition="right"
          className={quietStyle}
          data-run-action
          data-run-rerun-menu
        >
          Re-run
        </Button>
      }
    />
  );
  const right = (extra?: React.ReactNode) => (
    <div className={rightStyle}>
      {variant === 5 && !stop && failedCount > 0 ? (
        rerunMenu
      ) : (
        <>
          {rerunFailedButton}
          {actionButton}
        </>
      )}
      {simulateButton}
      {extra}
      {/* Publish publishes the editor's draft; it is here so the run view keeps every flow-level action. */}
      <Button
        size="sm"
        variant="solid"
        tone="neutral"
        tooltip="Publish the flow's draft"
      >
        Publish
      </Button>
      <RunMoreMenu />
    </div>
  );
  const toEditorLink = (
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconName="arrowLeft"
      className={flowLinkStyle}
      tooltip="Back to the editor"
      onClick={onEditor}
    >
      {flowName}
    </Button>
  );

  if (take) {
    const timeTake = runTimeTake();
    const target = backTarget(flowName);
    const goBack = () => {
      if (target.page === "history") {
        history.open(null);
      } else if (target.page === "runs") {
        navigate("/runs");
      } else {
        onEditor();
      }
    };
    const backButton = (
      <Button
        size="sm"
        variant="ghost"
        iconName="arrowLeft"
        className={editorBackStyle}
        aria-label={`Back to ${target.label}`}
        tooltip={`Back to ${target.label}`}
        onClick={goBack}
        data-run-back
      />
    );
    const flowTitle = (
      <Button
        size="sm"
        variant="ghost"
        tone="neutral"
        className={flowTitleStyle}
        tooltip="Open in editor"
        onClick={onEditor}
        data-run-open-editor
      >
        {flowName}
      </Button>
    );
    const rightSide = (
      <div
        className={
          take === 3 || take === 4
            ? `${rightStyle} ${css({ flex: "[0 0 auto]" })}`
            : rightStyle
        }
      >
        {take === 2 && timeTake === "t3" ? (
          <span className={startedStyle} data-run-time>
            {startedLine(run, now)}
          </span>
        ) : null}
        {rerunFailedButton}
        {actionButton}
        <RunBarMoreMenu onSimulate={onSimulate} />
      </div>
    );
    if (take === 2) {
      return (
        <>
          <div className={`${sideStyle} ${leftGapStyle}`} data-runbar="2">
            <Button
              size="sm"
              variant="ghost"
              iconName="arrowLeft"
              className={editorBackStyle}
              aria-label="Back to flows"
              tooltip="Back to flows"
              disabled={!onFlows}
              onClick={onFlows}
            />
            <span className={plainTitleStyle}>{flowName}</span>
            <RunSwitcher
              history={history}
              time={timeTake === "t1" ? shortTime(run, now) : undefined}
              label={
                timeTake === "t2" ? (
                  <>
                    {startTime(run)}
                    {liveTail(run, now) ? (
                      <span className={pickerTimeStyle} data-run-time>
                        {` · ${liveTail(run, now)}`}
                      </span>
                    ) : null}
                  </>
                ) : undefined
              }
            />
            {forEachSwitch}
          </div>
          <div className={centreStyle}>
            <SegmentedControl<"editor" | "history">
              size="md"
              className={css({
                "&[class]": { "--sc-item-px": "6px", "--form-padding-y": "3px" },
              })}
              aria-label="Flow view"
              items={[
                { value: "editor", label: "Editor" },
                { value: "history", label: "Logs" },
              ]}
              value="history"
              onChange={(view) =>
                view === "editor" ? onEditor() : history.open(null)
              }
            />
          </div>
          {rightSide}
        </>
      );
    }
    if (take === 3) {
      return (
        <>
          <div className={sideStyle} data-runbar="3">
            <BreadCrumbs size="sm" aria-label="Run">
              <BreadCrumbs.Item onClick={onEditor} maxWidth="320px" noCollapse>
                {flowName}
              </BreadCrumbs.Item>
              <BreadCrumbs.Item onClick={() => history.open(null)} noCollapse>
                Logs
              </BreadCrumbs.Item>
              <RunSwitcher history={history} withTime />
            </BreadCrumbs>
            {forEachSwitch}
          </div>
          {rightSide}
        </>
      );
    }
    if (take === 4) {
      const facts = factsOf(run, now);
      const count =
        facts.failures.length > 0
          ? ` · ${facts.failures.length} of ${facts.n} suppliers failed`
          : "";
      return (
        <>
          <div className={`${sideStyle} ${leftGapStyle}`} data-runbar="4">
            {backButton}
            {/* A two-line title, not a row of controls: its links are text. */}
            <div className={stackStyle} data-control-check="skip">
              <span className={pathLineStyle}>
                <button type="button" onClick={onEditor}>
                  {flowName}
                </button>
                <span aria-hidden>›</span>
                <button type="button" onClick={() => history.open(null)}>
                  Logs
                </button>
              </span>
              <span className={runLineStyle}>
                <RunGlyph
                  state={outcomeState[outcome]}
                  warnings={outcome === "warnings"}
                  run
                  size={12}
                />
                <RunSwitcher
                  history={history}
                  arrows={false}
                  trigger={
                    <button
                      type="button"
                      className={runNameStyle}
                      aria-label="Pick a run"
                      data-run-picker
                    >
                      <RunIdText run={run} prefix />
                    </button>
                  }
                />
                <span className={runStatusStyle}>
                  {`${statusWord[outcome]}${count} · ${run.when}`}
                </span>
              </span>
            </div>
            <RunSwitcher history={history} picker={false} />
            {forEachSwitch}
          </div>
          {rightSide}
        </>
      );
    }
    return (
      <>
        <div className={sideStyle} data-runbar="1">
          {backButton}
          {flowTitle}
        </div>
        <div className={forEachSwitch ? centreInRowStyle : centreStyle}>
          <RunSwitcher history={history} withTime={!forEachSwitch} />
          {forEachSwitch}
        </div>
        {rightSide}
      </>
    );
  }

  switch (variant) {
    case 2:
      return (
        <>
          <div className={sideStyle} data-topbar="2">
            <div className={groupStyle}>
              {toEditorLink}
              <span aria-hidden className={groupDividerStyle} />
              <RunSwitcher
                history={history}
                arrows={false}
                allRunsFirst
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    tone="neutral"
                    iconName="chevronDown"
                    iconPosition="right"
                    className={groupRunStyle}
                    tooltip={run.when}
                    data-run-picker
                  >
                    {runIdMono() ? <RunIdText run={run} prefix /> : runLabel(run)}
                  </Button>
                }
              />
            </div>
            <RunSwitcher history={history} picker={false} />
          </div>
          {right()}
        </>
      );
    case 3:
      return (
        <>
          <div className={sideStyle} data-topbar="3">
            <BreadCrumbs size="md" aria-label="Run">
              <BreadCrumbs.Item onClick={onEditor} maxWidth="320px" noCollapse>
                {flowName}
              </BreadCrumbs.Item>
              <BreadCrumbs.Item onClick={() => history.open(null)} noCollapse>
                All runs
              </BreadCrumbs.Item>
              <RunSwitcher history={history} />
            </BreadCrumbs>
          </div>
          {right()}
        </>
      );
    case 4:
      return (
        <>
          <div className={sideStyle} data-topbar="4">
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              iconName="arrowLeft"
              className={flowLinkStyle}
              tooltip="All runs of this flow"
              onClick={() => history.open(null)}
            >
              Logs
            </Button>
            <span className={runTitleStyle}>
              <RunIdText run={run} prefix />
            </span>
            <span className={runMetaStyle}>
              {statusText(run, now)} · {run.when}
            </span>
            <RunSwitcher
              history={history}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  iconName="chevronDown"
                  className={squareStyle}
                  aria-label="Pick a run"
                  tooltip="Pick a run"
                  data-run-picker
                />
              }
            />
          </div>
          {right(
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              className={quietStyle}
              onClick={onEditor}
            >
              Open in editor
            </Button>,
          )}
        </>
      );
    default: {
      if (back === "crumb") {
        return (
          <>
            <div className={sideStyle} data-topbar="1" data-runback="crumb">
              <BreadCrumbs size="sm" aria-label="Run">
                <BreadCrumbs.Item
                  onClick={onEditor}
                  maxWidth="320px"
                  noCollapse
                >
                  {flowName}
                </BreadCrumbs.Item>
                <BreadCrumbs.Item onClick={() => history.open(null)} noCollapse>
                  Logs
                </BreadCrumbs.Item>
                <RunSwitcher history={history} />
              </BreadCrumbs>
              {forEachSwitch}
            </div>
            {right()}
          </>
        );
      }
      const target = back === "editor" ? null : backTarget(flowName);
      const goBack = () => {
        if (target?.page === "history") {
          history.open(null);
        } else if (target?.page === "runs") {
          navigate("/runs");
        } else {
          onEditor();
        }
      };
      return (
        <>
          <div
            className={
              forEachSwitch
                ? `${sideStyle} ${css({ overflow: "hidden" })}`
                : sideStyle
            }
            data-topbar={variant === 5 ? "5" : "1"}
            data-runback={back}
          >
            {target ? (
              <Button
                size="sm"
                variant="ghost"
                tone="neutral"
                iconName="arrowLeft"
                className={flowLinkStyle}
                tooltip={`Back to ${target.label}`}
                onClick={goBack}
                data-run-back
              >
                {target.label}
              </Button>
            ) : (
              toEditorLink
            )}
            {/* All runs is Logs: once the way back goes there, the link would repeat it. */}
            {target?.page === "history" ? null : (
              <>
                <span aria-hidden className={dotStyle}>
                  ·
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  className={flowLinkStyle}
                  onClick={() => history.open(null)}
                >
                  All runs
                </Button>
              </>
            )}
          </div>
          {/* With the For each switcher the run's time moves to the picker's tooltip, so the actions keep one line. */}
          <div className={forEachSwitch ? centreInRowStyle : centreStyle}>
            <RunSwitcher history={history} withTime={!forEachSwitch} />
            {forEachSwitch}
          </div>
          {right(
            back === "split" ? (
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                className={quietStyle}
                onClick={onEditor}
                data-run-open-editor
              >
                Open in editor
              </Button>
            ) : undefined,
          )}
        </>
      );
    }
  }
};

/**
 * History without the segmented control, labelled by its run count ("17 runs", never a bare number). Take 2: a quiet
 * ghost button with the clock. Take 3: a link in the version line.
 */
export const HistoryButton = ({
  variant,
  runCount,
  onOpen,
}: {
  variant: "button" | "link";
  runCount: number;
  onOpen: () => void;
}) => (
  <Button
    size="sm"
    variant="ghost"
    tone="neutral"
    iconName={variant === "button" ? "clockRotateLeft" : undefined}
    className={variant === "button" ? quietStyle : flowLinkStyle}
    disabled={runCount === 0}
    tooltip={runCount === 0 ? "No runs yet" : "Every run of this flow"}
    onClick={onOpen}
    data-history-button
  >
    {runCount === 0
      ? "No runs"
      : `${runCount} ${runCount === 1 ? "run" : "runs"}`}
  </Button>
);
