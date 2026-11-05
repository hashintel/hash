/**
 * Top bar takes, for Aakarsh to pick from (4 Nov): "what's the most minimal version of the top bar we can do which is
 * still clear and like allows all the affordances". Minimal means fewer, quieter controls, never fewer functions.
 *
 * Run view (`?topbar=1..4`, remembered). No segmented control in any. Each has: back to the editor, all runs, the run
 * switcher (‹ › and the picker), Re-run (Stop on a live run), Simulate, Publish and ⋮. The takes differ only in
 * layout and grouping. A run with failed items adds "Re-run 2 failed" left of Re-run, its only place in the app.
 * 1. Centred switcher: ← flow · All runs | ‹ Run 16 · Today, 08:15 ▾ › | Re-run, Simulate, Publish, ⋮. The default.
 * 2. One control: [← flow / Run 16 ▾] ‹ ›, All runs first in the picker | Re-run, Simulate, Publish, ⋮.
 * 3. Breadcrumb: flow › All runs › ‹ Run 16 ▾ › | Re-run, Simulate, Publish, ⋮.
 * 4. Run as the title: ← History | Run 16 (big), "Failed · Today, 08:15", ‹ ▾ › | Re-run, Simulate, Open in editor,
 *    Publish, ⋮.
 *
 * Editor: take 1, picked by Aakarsh on 4 Nov. The others stay for comparison behind `?editorbar=2|3`, which is not
 * remembered, so the default route always shows take 1.
 * 1. T1: the Editor | History segmented control, centred.
 * 2. History as a quiet ghost button, "17 runs", beside Simulate.
 * 3. One muted line by the title, "v6 · Draft ▾ · 17 runs".
 * Every take has the title (renamed in place) and the version menu (V0–V7).
 */
import { BreadCrumbs, Button, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type HistoryValue, RunSwitcher } from "./history-view";
import { bannerAction, factsOf, outcomeOf, statusText } from "./run-history";

export type RunBarVariant = 1 | 2 | 3 | 4;
export type EditorBarVariant = 1 | 2 | 3;

/** `?<key>=` wins and is remembered (switching runs drops the query); else the last pick; else the default. */
const variantFrom = <Variant extends number>(
  query: URLSearchParams,
  key: string,
  storageKey: string,
  max: number,
  fallback: Variant,
): Variant => {
  const read = (value: string | null) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= max
      ? (number as Variant)
      : undefined;
  };
  const fromQuery = read(query.get(key));
  try {
    if (fromQuery) {
      globalThis.localStorage.setItem(storageKey, String(fromQuery));
      return fromQuery;
    }
    return read(globalThis.localStorage.getItem(storageKey)) ?? fallback;
  } catch {
    return fromQuery ?? fallback;
  }
};

// v2: the first takes (one had a segmented control) are retired; a remembered pick of them must not come back.
export const runBarVariant = (query: URLSearchParams) =>
  variantFrom<RunBarVariant>(query, "topbar", "flows-proto:topbar:v2", 4, 1);

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
});

const centreStyle = css({
  display: "flex",
  alignItems: "center",
  position: "absolute",
  top: "[50%]",
  left: "[50%]",
  transform: "[translate(-50%, -50%)]",
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
  history,
  flowName,
  onEditor,
  onSimulate,
}: {
  variant: RunBarVariant;
  history: HistoryValue;
  flowName: string;
  onEditor: () => void;
  /** The editor, with Simulate open on this run's inputs. */
  onSimulate: () => void;
}) => {
  const { run, now } = history;
  if (!run) {
    return null;
  }
  const outcome = outcomeOf(run, now);
  const stop = bannerAction(run, now) === "Stop";
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
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      iconName={stop ? "stop" : "rotate"}
      className={quietStyle}
      data-run-action
      onClick={() => (stop ? history.stop(run.id) : history.start())}
    >
      {stop ? "Stop" : "Re-run"}
    </Button>
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
  const right = (extra?: React.ReactNode) => (
    <div className={rightStyle}>
      {rerunFailedButton}
      {actionButton}
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
                    {`Run ${run.id}`}
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
              History
            </Button>
            <span className={runTitleStyle}>Run {run.id}</span>
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
    default:
      return (
        <>
          <div className={sideStyle} data-topbar="1">
            {toEditorLink}
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
          </div>
          <div className={centreStyle}>
            <RunSwitcher history={history} withTime />
          </div>
          {right()}
        </>
      );
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
