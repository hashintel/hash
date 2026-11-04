/**
 * The run view's top bar, four ways (Aakarsh, 4 Nov: "what's the most minimal version of the top bar we can do which
 * is still clear and like allows all the affordances"). Each gives the same three ways out: back to the editor, back
 * to all runs, and switching runs (‹ › and a picker). `?topbar=1..4` picks one; the pick is remembered.
 *
 * 1. Centred (Figma 1172:586): ← flow › ‹ Run 16 · time ▾ ›, the view switch in the middle, Run and Publish.
 * 2. One control: [← Monthly supplier review / Run 16 ▾] ‹ ›. ← is the editor; the picker opens with All runs.
 * 3. Breadcrumb only: Monthly supplier review › All runs › ‹ Run 16 ▾ ›, then Run. No Return to editor.
 * 4. Centred switcher: the flow (to History) on the left, ‹ Run 16 · time ▾ › in the middle, Done on the right.
 */
import {
  BreadCrumbs,
  Button,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type HistoryValue, RunSwitcher } from "./history-view";

export type TopBarVariant = 1 | 2 | 3 | 4;

const storageKey = "flows-proto:topbar";

/** `?topbar=` wins and is remembered (switching runs drops the query); else the last pick; else 1. */
export const topBarVariant = (query: URLSearchParams): TopBarVariant => {
  const read = (value: string | null) => {
    const number = Number(value);
    return number >= 1 && number <= 4 ? (number as TopBarVariant) : undefined;
  };
  const fromQuery = read(query.get("topbar"));
  try {
    if (fromQuery) {
      globalThis.localStorage.setItem(storageKey, String(fromQuery));
      return fromQuery;
    }
    return read(globalThis.localStorage.getItem(storageKey)) ?? 1;
  } catch {
    return fromQuery ?? 1;
  }
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

/** The editor's back button (24 px, white, a hairline), so both bars start the same way. */
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

const flowLinkStyle = css({
  "&[class]": {
    fontWeight: "medium",
    color: "neutral.fg.subtle",
    paddingX: "1.5",
    maxWidth: "[320px]",
  },
  "&[class]:hover": { color: "neutral.fg.heading" },
});

const separatorStyle = css({ color: "neutral.fg.subtle" });

const viewSwitchSizeStyle = css({
  "&[class]": { "--sc-item-px": "6px", "--form-padding-y": "3px" },
});

/** Top bar 2's one control: a hairline group holding the way back and the run picker. */
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

const quietStyle = css({ "&[class]": { color: "neutral.fg.muted.hover" } });

export const RunTopBar = ({
  variant,
  history,
  flowName,
  onEditor,
  canRun,
}: {
  variant: TopBarVariant;
  history: HistoryValue;
  flowName: string;
  onEditor: () => void;
  canRun: boolean;
}) => {
  const run = history.run;
  if (!run) {
    return null;
  }
  const runButton = (
    <Button
      size="sm"
      variant="subtle"
      tone="neutral"
      iconName="play"
      className={quietStyle}
      disabled={!canRun}
      tooltip={
        canRun
          ? "Start another run"
          : "Manual runs are off for this flow. Turn them on in Triggers."
      }
      onClick={() => history.start()}
    >
      Run
    </Button>
  );

  switch (variant) {
    case 2:
      return (
        <>
          <div className={sideStyle}>
            <div className={groupStyle} data-topbar="2">
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
          <div className={rightStyle}>{runButton}</div>
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
          <div className={rightStyle}>{runButton}</div>
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
              iconName="list"
              className={flowLinkStyle}
              tooltip="All runs of this flow"
              onClick={() => history.open(null)}
            >
              {flowName}
            </Button>
          </div>
          <div className={centreStyle}>
            <RunSwitcher history={history} withTime />
          </div>
          <div className={rightStyle}>
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              tooltip="Back to the editor"
              onClick={onEditor}
            >
              Done
            </Button>
          </div>
        </>
      );
    default:
      return (
        <>
          <div className={sideStyle} data-topbar="1">
            <Button
              size="xs"
              variant="ghost"
              iconName="arrowLeft"
              className={backStyle}
              aria-label="Back to the editor"
              tooltip="Back to the editor"
              onClick={onEditor}
            />
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              className={flowLinkStyle}
              onClick={onEditor}
            >
              {flowName}
            </Button>
            <span aria-hidden className={separatorStyle}>
              ›
            </span>
            <RunSwitcher history={history} withTime bordered />
          </div>
          {/* Parked in runs (4 Nov); shown here as the "switch" option. History is the list of runs. */}
          <div className={centreStyle}>
            <SegmentedControl<"editor" | "history">
              size="md"
              className={viewSwitchSizeStyle}
              aria-label="Flow view"
              items={[
                { value: "editor", label: "Editor" },
                { value: "history", label: "History" },
              ]}
              value="history"
              onChange={(view) =>
                view === "editor" ? onEditor() : history.open(null)
              }
            />
          </div>
          <div className={rightStyle}>
            {runButton}
            <Button size="sm" variant="solid" tone="neutral">
              Publish
            </Button>
          </div>
        </>
      );
  }
};
