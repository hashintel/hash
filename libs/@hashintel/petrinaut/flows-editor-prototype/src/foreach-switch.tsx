/**
 * One item of a run's For each on the canvas (6 Nov sync, B10: "select which supplier and then it shows you the
 * instance … an arrow that they can traverse through each supplier's email"). Picking a supplier swaps the canvas to
 * that item: each step inside the For each shows that item's state, its bar one segment. "All suppliers" returns to
 * the counts across every item, which stay the default view.
 *
 * `?foreachswitch=` places the switcher, from the URL only, never remembered; unset, there is none.
 * - top: "For each supplier · Northwind Alloys ▾ ‹ ›" in the run's top bar, beside the run switcher.
 * - box: the same control on the For each box's header on the canvas.
 * - f3: the Run outputs playground's take f3 in the top bar: "‹ All suppliers ▾ ›", failed items first.
 *
 * The picked item is selection, so it lives in the query (`?item=<n>`, from 1) and a run change drops it.
 */
import { type ReactNode, use } from "react";

import { Button, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { findStep } from "./document";
import { useEditor } from "./editor-context";
import { HistoryContext, type HistoryValue, useRunView } from "./history-view";
import { setQuery, useLocation } from "./router";
import { RunGlyph } from "./run-glyph";
import {
  type BarSegment,
  factsOf,
  forEachId,
  type RunFacts,
  type StepRun,
  type StepState,
  suppliers,
} from "./run-history";

export type ForEachSwitchTake = "top" | "box" | "f3";

export const forEachSwitchTake = (
  query: URLSearchParams,
): ForEachSwitchTake | null => {
  const take = query.get("foreachswitch");
  return take === "top" || take === "box" || take === "f3" ? take : null;
};

/** The loop's stages, as `run-history.ts` runs them: the three reads, then Fetch, Send, Mark. */
const stages = [
  ["readName", "readEmail", "readCertificateLink"],
  ["fetchCertificate"],
  ["sendReviewEmail"],
  ["markReviewed"],
] as const;

const segmentOf: Record<StepState, BarSegment["state"]> = {
  notReached: "rest",
  running: "running",
  done: "done",
  failed: "failed",
  needsReview: "review",
  skipped: "skipped",
  abandoned: "rest",
  doneWithFailures: "done",
};

const single = (state: StepState): StepRun => ({
  state,
  bar: [{ state: segmentOf[state], count: 1 }],
  progress: {
    done: state === "done" ? 1 : 0,
    failed: state === "failed" ? 1 : 0,
    total: 1,
  },
});

/** One item's state at one stage: done, failed at the fetch, skipped after it, running now, or not reached. */
const itemStageState = (
  facts: RunFacts,
  item: number,
  stage: number,
): StepState => {
  if (facts.find !== "done") {
    return "notReached";
  }
  const processed = facts.processed[stage] ?? 0;
  const failedItem = facts.failures.some((failure) => failure.item === item);
  if (processed > item) {
    return failedItem && stage === 1
      ? "failed"
      : failedItem && stage > 1
        ? "skipped"
        : "done";
  }
  if (facts.abandoned) {
    return "notReached";
  }
  return facts.inFlight && processed === item ? "running" : "notReached";
};

/** The item as a whole: failed at the fetch, done through Mark, or under way. */
export const itemState = (facts: RunFacts, item: number): StepState => {
  const fetch = itemStageState(facts, item, 1);
  if (fetch === "failed") {
    return "failed";
  }
  const last = itemStageState(facts, item, stages.length - 1);
  if (last === "done") {
    return "done";
  }
  return itemStageState(facts, item, 0) === "notReached"
    ? facts.abandoned
      ? "abandoned"
      : "notReached"
    : "running";
};

/** Each step in the For each, and the box itself, for one item. Pure; the steps outside keep their run state. */
export const instanceStepRuns = (
  facts: RunFacts,
  item: number,
): Record<string, StepRun> => {
  const runs: Record<string, StepRun> = {
    [forEachId]: single(itemState(facts, item)),
  };
  stages.forEach((ids, stage) => {
    for (const id of ids) {
      runs[id] = single(itemStageState(facts, item, stage));
    }
  });
  return runs;
};

/** The picked item (0-based) and how to change it; null is "All suppliers". */
export const useForEachItem = () => {
  const { query } = useLocation();
  const raw = Number(query.get("item"));
  return {
    take: forEachSwitchTake(query),
    item: Number.isInteger(raw) && raw >= 1 ? raw - 1 : null,
    pick: (item: number | null) =>
      setQuery("item", item === null ? null : String(item + 1)),
  };
};

/**
 * Wraps the canvas: with a take on and an item picked, the run the canvas reads shows that item. Everything outside
 * (the panels, the Steps tree) keeps the whole run.
 */
export const ForEachInstanceScope = ({ children }: { children: ReactNode }) => {
  const history = use(HistoryContext);
  const { ui } = useEditor();
  const { take, item } = useForEachItem();
  if (
    !take ||
    item === null ||
    !history?.run ||
    !history.steps ||
    !ui.history
  ) {
    return children;
  }
  const facts = factsOf(history.run, history.now);
  if (item >= facts.n) {
    return children;
  }
  const scoped: HistoryValue = {
    ...history,
    steps: { ...history.steps, ...instanceStepRuns(facts, item) },
  };
  return <HistoryContext value={scoped}>{children}</HistoryContext>;
};

const squareStyle = css({
  "&[class]": {
    width: "[28px]",
    minWidth: "[28px]",
    height: "[28px]",
    padding: "[0]",
  },
});

const pickerStyle = css({
  "&[class]": {
    fontWeight: "medium",
    color: "neutral.fg.heading",
    paddingX: "1.5",
  },
});

const quietNameStyle = css({ color: "neutral.fg.subtle" });

const glyphSpaceStyle = css({ width: "[14px]", flexShrink: 0 });

const menuRowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
});

const dividerStyle = css({
  width: "[1px]",
  height: "[16px]",
  marginX: "2",
  backgroundColor: "neutral.bd.subtle",
});

/**
 * The item picker and the arrows through the items.
 * - named (top): "For each supplier · Northwind Alloys ▾ ‹ ›", items in run order with their state.
 * - plain (box): the same without the name, which the box's header already shows.
 * - f3: the Run outputs playground's take f3 (inbox picks/foreach-run-items): "‹ All suppliers ▾ ›" in a hairline
 *   box, the failed items first with a cross, the arrows walking that order.
 */
const ForEachSwitch = ({
  history,
  look,
}: {
  history: HistoryValue;
  look: "named" | "plain" | "f3";
}) => {
  const { document } = useEditor();
  const { item, pick } = useForEachItem();
  const run = history.run;
  if (!run) {
    return null;
  }
  const facts = factsOf(run, history.now);
  const name = findStep(document, forEachId)?.step.description || "For each";
  const names = suppliers.slice(0, facts.n);
  const current = item !== null && item < names.length ? item : null;
  const label = (current === null ? null : names[current]) ?? "All suppliers";
  const failed = (index: number) => itemState(facts, index) === "failed";
  // f3 lists (and steps through) the failed items first; the others keep run order.
  const order = names
    .map((_, index) => index)
    .sort((left, right) =>
      look === "f3" ? Number(failed(right)) - Number(failed(left)) : 0,
    );
  const position = current === null ? -1 : order.indexOf(current);
  const step = (by: -1 | 1) => {
    const next = position + by;
    pick(next < 0 ? null : (order[Math.min(next, order.length - 1)] ?? null));
  };
  const menu = (
    <Menu
      position="bottom-start"
      className={css({ width: "[280px]", maxHeight: "[420px]" })}
      items={[
        {
          id: "all",
          label: "",
          items: [
            {
              id: "all-items",
              text: "All suppliers",
              icon: look === "f3" ? undefined : ("list" as const),
              selected: current === null,
              selectedStyle: "highlight" as const,
              onClick: () => pick(null),
            },
          ],
        },
        {
          id: "items",
          label: look === "f3" ? "" : "Suppliers",
          items: order.map((index) => ({
            id: `item-${index}`,
            text: (
              <span className={menuRowStyle}>
                {look === "f3" && !failed(index) ? (
                  <span aria-hidden className={glyphSpaceStyle} />
                ) : (
                  <RunGlyph
                    state={itemState(facts, index)}
                    size={14}
                    tooltip={false}
                  />
                )}
                <span>{names[index]}</span>
              </span>
            ),
            selected: current === index,
            selectedStyle: "highlight" as const,
            onClick: () => pick(index),
          })),
        },
      ]}
      trigger={
        <Button
          size="sm"
          variant={look === "f3" ? "subtle" : "ghost"}
          tone="neutral"
          iconName="chevronDown"
          iconPosition="right"
          className={pickerStyle}
          data-foreach-picker
        >
          {look === "named" ? (
            <>
              <span className={quietNameStyle}>{name}</span>
              {" · "}
              {label}
            </>
          ) : (
            label
          )}
        </Button>
      }
    />
  );
  const previous = (
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconName="chevronLeft"
      className={squareStyle}
      aria-label="Previous supplier"
      tooltip="Previous supplier"
      disabled={current === null}
      onClick={() => step(-1)}
    />
  );
  const next = (
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconName="chevronRight"
      className={squareStyle}
      aria-label="Next supplier"
      tooltip="Next supplier"
      disabled={position === order.length - 1}
      onClick={() => step(1)}
    />
  );
  return (
    <div
      className={`${css({ display: "flex", alignItems: "center", gap: "0.5" })} nodrag nopan`}
      data-foreach-switch={look}
    >
      {look === "f3" ? previous : null}
      {menu}
      {look === "f3" ? null : previous}
      {next}
    </div>
  );
};

/** `?foreachswitch=top` or `f3`, in the run's top bar after a hairline. */
export const ForEachTopSwitch = () => {
  const history = useRunView();
  const { take } = useForEachItem();
  if ((take !== "top" && take !== "f3") || !history) {
    return null;
  }
  return (
    <>
      <span aria-hidden className={dividerStyle} />
      <ForEachSwitch history={history} look={take === "f3" ? "f3" : "named"} />
    </>
  );
};

/** `?foreachswitch=box`, at the right of the For each box's header. */
export const ForEachBoxSwitch = ({ stepId }: { stepId: string }) => {
  const history = useRunView();
  const { take } = useForEachItem();
  if (take !== "box" || !history || stepId !== forEachId) {
    return null;
  }
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps a click on the control off the box
    <div
      // Clear of the box's run glyph in the top-right corner.
      className={css({ marginLeft: "auto", marginRight: "5" })}
      onClick={(event) => event.stopPropagation()}
    >
      <ForEachSwitch history={history} look="plain" />
    </div>
  );
};
