/**
 * One item of a run's For each on the canvas (6 Nov sync, B10: "select which supplier and then it shows you the
 * instance … an arrow that they can traverse through each supplier's email"). Picking a supplier swaps the canvas to
 * that item: each step inside the For each shows that item's state, its bar one segment. "All suppliers" returns to
 * the counts across every item, which stay the default view.
 *
 * `?foreachswitch=` places the switcher, from the URL only, never remembered; unset, there is none.
 * - arrows: "‹ 4 of 20 › Boreal Metals" on the For each box's header, after its title; "‹ All 20 ›" for every item.
 * - dropdown: "Boreal Metals ▾" on the box's header: All suppliers, then each supplier with its mark, failed first.
 * - toggle: "All · One item" on the box's header; One item adds "‹ Boreal Metals ›".
 * - top: "For each supplier · Boreal Metals ▾ ‹ ›" in the run's top bar, beside the run switcher; the same menu.
 * Earlier values still work: box is dropdown, f3 is top.
 *
 * The picked item is selection, so it lives in the query (`?item=<n>`, from 1) and a run change drops it.
 */
import { type ReactNode, use } from "react";

import { Button, Menu, SegmentedControl } from "@hashintel/ds-components";
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

export type ForEachSwitchTake = "arrows" | "dropdown" | "toggle" | "top";

const takeAliases = new Map<string, ForEachSwitchTake>([
  ["arrows", "arrows"],
  ["dropdown", "dropdown"],
  ["toggle", "toggle"],
  ["top", "top"],
  ["box", "dropdown"],
  ["f3", "top"],
]);

export const forEachSwitchTake = (
  query: URLSearchParams,
): ForEachSwitchTake | null =>
  takeAliases.get(query.get("foreachswitch") ?? "") ?? null;

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
    height: "[28px]",
    fontWeight: "medium",
    color: "neutral.fg.heading",
    paddingX: "1.5",
  },
});

const quietNameStyle = css({ color: "neutral.fg.subtle" });

const glyphSpaceStyle = css({ width: "[16px]", flexShrink: 0 });

const rowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
});

const arrowsStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5",
});

const countStyle = css({
  minWidth: "[64px]",
  textAlign: "center",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const nameStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
});

/** The DS SegmentedControl md at 28 px items, 6 px in, as the editor's Editor | Logs switch (app.tsx). */
const segmentStyle = css({
  "&[class]": { "--sc-item-px": "6px", "--form-padding-y": "3px" },
});

const dividerStyle = css({
  width: "[1px]",
  height: "[16px]",
  marginX: "2",
  backgroundColor: "neutral.bd.subtle",
});

/** The run's For each items: the picked one, run order, and failed-first order for the menus. */
const useItems = (history: HistoryValue | null) => {
  const { item, pick } = useForEachItem();
  const run = history?.run;
  if (!history || !run) {
    return null;
  }
  const facts = factsOf(run, history.now);
  const names = suppliers.slice(0, facts.n);
  const current = item !== null && item < names.length ? item : null;
  const failed = (index: number) => itemState(facts, index) === "failed";
  const failedFirst = names
    .map((_, index) => index)
    .sort((left, right) => Number(failed(right)) - Number(failed(left)));
  return { facts, names, current, pick, failedFirst };
};

type Items = NonNullable<ReturnType<typeof useItems>>;

/** An item's mark and name: "✕ Boreal Metals". */
const ItemName = ({ items, index }: { items: Items; index: number }) => (
  <span className={nameStyle}>
    <RunGlyph state={itemState(items.facts, index)} size={16} tooltip={false} />
    {items.names[index]}
  </span>
);

const ArrowButton = ({
  direction,
  disabled = false,
  onClick,
}: {
  direction: "previous" | "next";
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    size="sm"
    variant="ghost"
    tone="neutral"
    iconName={direction === "previous" ? "chevronLeft" : "chevronRight"}
    className={squareStyle}
    aria-label={
      direction === "previous" ? "Previous supplier" : "Next supplier"
    }
    tooltip={direction === "previous" ? "Previous supplier" : "Next supplier"}
    disabled={disabled}
    onClick={onClick}
  />
);

/**
 * All suppliers, then each supplier with its mark, failed first.
 * - box (dropdown): "Boreal Metals ▾" with its mark, a subtle button on the box's header.
 * - top: "For each supplier · Boreal Metals ▾", a ghost button in the top bar.
 */
const ItemMenu = ({
  items,
  look,
  title,
}: {
  items: Items;
  look: "box" | "top";
  title: string;
}) => {
  const { names, current, pick, failedFirst } = items;
  return (
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
              text: (
                <span className={rowStyle}>
                  <span aria-hidden className={glyphSpaceStyle} />
                  <span>All suppliers</span>
                </span>
              ),
              selected: current === null,
              selectedStyle: "highlight" as const,
              onClick: () => pick(null),
            },
          ],
        },
        {
          id: "items",
          label: "",
          items: failedFirst.map((index) => ({
            id: `item-${index}`,
            text: (
              <span className={rowStyle}>
                <RunGlyph
                  state={itemState(items.facts, index)}
                  size={16}
                  tooltip={false}
                />
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
          variant={look === "box" ? "subtle" : "ghost"}
          tone="neutral"
          iconName="chevronDown"
          iconPosition="right"
          className={pickerStyle}
          data-foreach-picker
        >
          {look === "top" ? (
            <>
              <span className={quietNameStyle}>{title}</span>
              {" · "}
              {current === null ? "All suppliers" : names[current]}
            </>
          ) : current === null ? (
            "All suppliers"
          ) : (
            <ItemName items={items} index={current} />
          )}
        </Button>
      }
    />
  );
};

/** arrows: "‹ 4 of 20 › Boreal Metals" in run order; "‹ All 20 ›" sits before the first and after the last. */
const ArrowsSwitch = ({ items }: { items: Items }) => {
  const { names, current, pick } = items;
  const count = names.length;
  const step = (by: -1 | 1) => {
    const next = current === null ? (by === 1 ? 0 : count - 1) : current + by;
    pick(next < 0 || next >= count ? null : next);
  };
  return (
    <div className={rowStyle}>
      <div className={arrowsStyle}>
        <ArrowButton direction="previous" onClick={() => step(-1)} />
        <span className={countStyle}>
          {current === null ? `All ${count}` : `${current + 1} of ${count}`}
        </span>
        <ArrowButton direction="next" onClick={() => step(1)} />
      </div>
      {current === null ? null : <ItemName items={items} index={current} />}
    </div>
  );
};

/** toggle: "All · One item"; One item starts on the first failed item and adds "‹ Boreal Metals ›" in run order. */
const ToggleSwitch = ({ items }: { items: Items }) => {
  const { names, current, pick, failedFirst } = items;
  return (
    <div className={rowStyle}>
      <SegmentedControl<"all" | "one">
        size="md"
        className={segmentStyle}
        aria-label="Suppliers shown"
        items={[
          { value: "all", label: "All" },
          { value: "one", label: "One item" },
        ]}
        value={current === null ? "all" : "one"}
        onChange={(shown) =>
          pick(shown === "all" ? null : (failedFirst[0] ?? 0))
        }
      />
      {current === null ? null : (
        <div className={arrowsStyle}>
          <ArrowButton
            direction="previous"
            disabled={current === 0}
            onClick={() => pick(current - 1)}
          />
          <ItemName items={items} index={current} />
          <ArrowButton
            direction="next"
            disabled={current === names.length - 1}
            onClick={() => pick(current + 1)}
          />
        </div>
      )}
    </div>
  );
};

/** `?foreachswitch=top`: the menu and the arrows in the run's top bar after a hairline. */
export const ForEachTopSwitch = () => {
  const history = useRunView();
  const { document } = useEditor();
  const { take } = useForEachItem();
  const items = useItems(history);
  if (take !== "top" || !items) {
    return null;
  }
  const { names, current, pick } = items;
  const title = findStep(document, forEachId)?.step.description || "For each";
  return (
    <>
      <span aria-hidden className={dividerStyle} />
      <div
        className={css({ display: "flex", alignItems: "center", gap: "0.5" })}
        data-foreach-switch="top"
      >
        <ItemMenu items={items} look="top" title={title} />
        <ArrowButton
          direction="previous"
          disabled={current === null}
          onClick={() =>
            pick(current === null || current === 0 ? null : current - 1)
          }
        />
        <ArrowButton
          direction="next"
          disabled={current === names.length - 1}
          onClick={() => pick(current === null ? 0 : current + 1)}
        />
      </div>
    </>
  );
};

/** `?foreachswitch=arrows|dropdown|toggle`: on the For each box's header, after its title and a hairline. */
export const ForEachBoxSwitch = ({ stepId }: { stepId: string }) => {
  const history = useRunView();
  const { take } = useForEachItem();
  const items = useItems(history);
  if (
    (take !== "arrows" && take !== "dropdown" && take !== "toggle") ||
    !items ||
    stepId !== forEachId
  ) {
    return null;
  }
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps a click on the control off the box
    <div
      className={`${css({ display: "flex", alignItems: "center", minWidth: "[0]" })} nodrag nopan`}
      data-foreach-switch={take}
      onClick={(event) => event.stopPropagation()}
    >
      <span aria-hidden className={dividerStyle} />
      {take === "arrows" ? (
        <ArrowsSwitch items={items} />
      ) : take === "toggle" ? (
        <ToggleSwitch items={items} />
      ) : (
        <ItemMenu items={items} look="box" title="" />
      )}
    </div>
  );
};
