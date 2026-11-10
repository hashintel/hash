import { useState } from "react";

import {
  Button,
  Icon,
  type IconName,
  TextInput,
} from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import {
  type CatalogEntry,
  catalog as fullCatalog,
  groupEntries,
  stepGroups,
  isOffered,
} from "./catalog";

/** ?flowoutput=: the faint glyph after a step with a flow output, and the Flow outputs row's count. */
const flowGlyphStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  color: "neutral.fg.subtle",
  "& svg": { width: "[12px]", height: "[12px]" },
  // A run's read-only star (?runstars=a): filled, one step darker.
  "&[data-filled]": { color: "neutral.fg.muted", "& svg": { fill: "[currentColor]" } },
});

const flowCountStyle = css({
  marginLeft: "auto",
  textStyle: "xxs",
  color: "neutral.fg.subtle",
});

/** Manual journeys only (ledger, 21 Oct): AI steps are parked. */
const catalog = fullCatalog.filter(isOffered);
import {
  START_ID,
  addStep,
  type DraftStep,
  type EditorDocument,
  findStep,
  flaggedOutputsOf,
  flattenSteps,
  stepLabel,
  stepTitle,
} from "./document";
import { FLOW_OUTPUTS_ID } from "./flow-outputs";
import { useFlowOutputTake, useRunStars, useStarCopy } from "./outputs";
import { type EditorUi, useEditor } from "./editor-context";
import { useLocation } from "./router";
import { cellText, StatusCell } from "./status-cell";
import { treeTileColor } from "./status-colors";
import { InlineStepPicker, pickerTake } from "./step-picker";

import type { StepRun } from "./run-history";

type Tone = "green" | "orange" | "neutral" | "blue";

/**
 * The left panel (agreed build order E4, Dei 13 Oct; the "Steps" panel on ↳ Current): "In this flow" lists the
 * flow's nodes as D19 A rows, "Add steps" is a searchable library with its groups collapsed.
 */
const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  width: "[248px]",
  height: "[100%]",
  backgroundColor: "neutral.bgSolid.min",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

/** A D19 A row: 32 px, 4 px in, 6 px corners, a 12 px chevron slot, a 20 px tile and a 13 px label. */
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "[100%]",
  height: "[32px]",
  paddingLeft: "1",
  // The count at the right keeps 8 px inside the selected fill.
  paddingRight: "2",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  lineHeight: "[14px]",
  fontWeight: "medium",
  // J1.1 (3 Nov): a row is muted; the selected one is dark, with no blue and no fill (ledger, 2 Nov).
  color: "neutral.fg.muted.hover",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  _focusVisible: {
    backgroundColor: "neutral.bg.surface.active",
    outline: "none",
  },
  // Every row, groups and the selected one too, keeps the DS Sidebar Item's Medium (Figma, 3 Nov).
  "&[aria-current=true]": { color: "neutral.fg.heading" },
});

const chevronSlotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  // J1.1: the expand slot is 8 px at 4 px in; with the row's 6 px gap the tile lands 16 px in.
  width: "[6px]",
  height: "[16px]",
  color: "neutral.fg.subtle",
  "& svg": { width: "[10px]", height: "[10px]" },
});

const tileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    // D19 A tile (2 Nov): 14 px, 3 px corners, grey for every type; only the 10 px glyph keeps its colour.
    width: "[14px]",
    height: "[14px]",
    borderRadius: "[3px]",
    backgroundColor: "neutral.bgSolid.surface",
    "&[class] svg": {
      width: "[10px]",
      height: "[10px]",
      "--icon-size": "10px",
    },
  },
  variants: {
    tone: {
      // Neutral for every type (Aakarsh, 4 Nov); `tone` stays for when the Flows palette is picked.
      green: { color: "neutral.fg.muted" },
      orange: { color: "neutral.fg.muted" },
      blue: { color: "neutral.fg.muted" },
      neutral: { color: "neutral.fg.muted" },
    },
  },
});

const labelStyle = css({
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const countStyle = css({ textStyle: "xxs", color: "neutral.fg.subtle" });

/**
 * The text at a Steps-tree row's right ("6 steps", "19 of 20", "Needs review"), inbox `picks/row-text`: a is the
 * default (Aakarsh, 5 Nov: "push this no text thing"). ?rowtext=b|c|d shows the other takes and ?rowtext=today the
 * text on every row, URL only.
 * - a: the text shows only while the row is hovered or selected.
 * - b: no text; the mark's tooltip carries the count or reason.
 * - c: no text, and a step done for only some items draws the progress ring, so the mark itself says "not all".
 * - d: a failed or needs-review row keeps its word; counts show only while the row is hovered or selected.
 */
type RowTextTake = "a" | "b" | "c" | "d";

const useRowTextTake = (): RowTextTake | null => {
  const value = useLocation().query.get("rowtext");
  if (value === "today") {
    return null;
  }
  return value === "b" || value === "c" || value === "d" ? value : "a";
};

/** Hidden until its row is hovered or selected (takes a and d). */
const onRowHoverStyle = css({
  display: "none",
  "button:hover &": { display: "inline" },
  "button:focus-visible &": { display: "inline" },
  "button[aria-current=true] &": { display: "inline" },
});

const Tile = ({ icon, tone }: { icon: IconName; tone: Tone }) => (
  <span className={tileStyle({ tone })} style={treeTileColor(icon)}>
    <Icon name={icon} size="sm" />
  </span>
);

const stepLook = (step: DraftStep): { icon: IconName; tone: Tone } => {
  if (step.kind === "for-each") {
    return { icon: "rotate", tone: "green" };
  }
  const entry = fullCatalog.find(
    (candidate) => candidate.id === step.actionDefinitionId,
  );
  return { icon: entry?.icon ?? "cube", tone: entry?.tone ?? "green" };
};

/** "N STEPS" and "Collapse all", as the run prototype's list head. */
const listHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "[32px]",
  paddingLeft: "3",
  // 14 px, not 16: centres the 21 px Collapse all button on the rows' 16 px run marks (5 Nov: "misaligned").
  paddingRight: "[14px]",
  textStyle: "xs",
  color: "neutral.fg.muted",
});

/**
 * "In this flow": Start, then the steps in order, children of a For each indented under it. In a run the same tree
 * shows, with each step's run mark at the row's right (`statusFor`).
 */
const FlowList = ({
  statusFor,
}: {
  statusFor?: (stepId: string) => StepRun;
}) => {
  const { document, ui, setUi } = useEditor();
  // M1 (decided 5 Nov, inbox flow-output-mark): a faint star on a step that has a flow output, by default.
  // ?flowoutput=2|3 show a flag instead; 4 and 5 move the mark to the flow-level view.
  const flowTake = useFlowOutputTake() ?? 1;
  const starCopy = useStarCopy();
  // B2 (6 Nov): in a run, ?runstars=a fills the star (read-only); b leaves it out of the Steps list.
  const runStars = useRunStars();
  const inRun = Boolean(statusFor);
  const flowMark = (stepId: string) =>
    flowTake <= 3 &&
    !(inRun && runStars === "b") &&
    flaggedOutputsOf(document).some((key) => key.startsWith(`${stepId}.`)) ? (
      <span
        className={flowGlyphStyle}
        data-flow-output-glyph
        data-filled={(inRun && runStars === "a") || undefined}
      >
        <Icon name={flowTake === 1 ? "star" : "rightToLine"} size="xs" />
      </span>
    ) : null;
  const rowText = useRowTextTake();
  /** The editor's "6 steps" count, per the ?rowtext= take. */
  const groupCount = (text: string) =>
    rowText === "b" || rowText === "c" ? null : (
      <span
        className={
          rowText === "a" || rowText === "d"
            ? `${countStyle} ${onRowHoverStyle}`
            : countStyle
        }
      >
        {text}
      </span>
    );
  // One status cell per row: the count or reason only where it adds something, then the glyph at the right edge.
  const mark = (stepId: string) => {
    if (!statusFor) {
      return null;
    }
    const status = statusFor(stepId);
    const text = cellText(status);
    const isWord = status.state === "failed" || status.state === "needsReview";
    // Take c: done for only some items so far reads as the progress ring, not a tick.
    const partial =
      rowText === "c" &&
      status.state === "done" &&
      status.progress !== undefined &&
      status.progress.done < status.progress.total;
    return (
      <StatusCell
        state={partial ? "doneWithFailures" : status.state}
        progress={status.progress}
        text={rowText === "b" || rowText === "c" ? undefined : text}
        textClassName={
          rowText === "a" || (rowText === "d" && !isWord)
            ? onRowHoverStyle
            : undefined
        }
        detail={status.state === "failed" ? status.count : undefined}
        textFirst
        small
      />
    );
  };
  // Shared with the canvas: a For each closed here folds its box there too (J1.13).
  const closed = ui.collapsed ?? [];
  const setClosed = (next: string[] | ((current: string[]) => string[])) =>
    setUi((current) => ({
      ...current,
      collapsed:
        typeof next === "function" ? next(current.collapsed ?? []) : next,
    }));
  const select = (id: string) =>
    setUi((current) => ({
      ...current,
      selectedId: id,
      selectedIds: [id],
      triggerId: null,
      openField: null,
    }));
  const groups = flattenSteps(document.steps)
    .map(({ step }) => step)
    .filter((step) => step.kind === "for-each")
    .map((step) => step.stepId);
  const allClosed =
    groups.length > 0 && groups.every((id) => closed.includes(id));
  // Start is a row of the list too.
  const total = flattenSteps(document.steps).length + 1;

  const stepRows = (
    steps: DraftStep[],
    depth: number,
    nested: (steps: DraftStep[], depth: number) => React.ReactNode[],
  ): React.ReactNode[] =>
    steps.flatMap((step) => {
      const look = stepLook(step);
      const pad = { paddingLeft: 4 + depth * 16 };
      if (step.kind === "for-each") {
        const open = !closed.includes(step.stepId);
        const inside = flattenSteps(step.steps).length;
        const row = (
          <button
            key={step.stepId}
            type="button"
            className={rowStyle}
            style={pad}
            aria-current={ui.selectedId === step.stepId || undefined}
            aria-expanded={open}
            data-flow-row={step.stepId}
            onClick={() => select(step.stepId)}
          >
            <span
              className={chevronSlotStyle}
              role="presentation"
              onClick={(event) => {
                event.stopPropagation();
                setClosed((current) =>
                  open
                    ? [...current, step.stepId]
                    : current.filter((id) => id !== step.stepId),
                );
              }}
            >
              <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
            </span>
            <Tile icon={look.icon} tone={look.tone} />
            <span className={labelStyle}>{stepLabel(step)}</span>
            {flowMark(step.stepId)}
            {statusFor
              ? mark(step.stepId)
              : groupCount(inside === 1 ? "1 step" : `${inside} steps`)}
          </button>
        );
        return open ? [row, ...nested(step.steps, depth + 1)] : [row];
      }
      return [
        <button
          key={step.stepId}
          type="button"
          className={rowStyle}
          style={pad}
          aria-current={ui.selectedId === step.stepId || undefined}
          data-flow-row={step.stepId}
          title={`${stepTitle(step)} · ${stepLabel(step)}`}
          onClick={() => select(step.stepId)}
        >
          <span className={chevronSlotStyle} />
          <Tile icon={look.icon} tone={look.tone} />
          <span className={labelStyle}>{stepLabel(step)}</span>
          {flowMark(step.stepId)}
          {mark(step.stepId)}
        </button>,
      ];
    });

  /**
   * D16: siblings that start together (fed by the same step and port, or by nothing inside a For each) show as one
   * collapsible "In parallel" group.
   */
  const withParallel = (
    steps: DraftStep[],
    depth: number,
  ): React.ReactNode[] => {
    const ids = new Set(steps.map((step) => step.stepId));
    const feed = (step: DraftStep) => {
      const incoming = document.wires.filter(
        (wire) => wire.target === step.stepId,
      );
      const fromSibling = incoming.find((wire) => ids.has(wire.source));
      return fromSibling
        ? `${fromSibling.source}:${fromSibling.sourcePort}`
        : incoming.length === 0
          ? "start of group"
          : `${incoming[0]!.source}:${incoming[0]!.sourcePort}`;
    };
    const byFeed = new Map<string, DraftStep[]>();
    for (const step of steps) {
      byFeed.set(feed(step), [...(byFeed.get(feed(step)) ?? []), step]);
    }
    const shown = new Set<string>();
    return steps.flatMap((step) => {
      if (shown.has(step.stepId)) {
        return [];
      }
      const together = byFeed.get(feed(step)) ?? [step];
      if (together.length < 2) {
        shown.add(step.stepId);
        return stepRows([step], depth, withParallel);
      }
      for (const member of together) {
        shown.add(member.stepId);
      }
      const key = `parallel:${feed(step)}`;
      const open = !closed.includes(key);
      return [
        <button
          key={key}
          type="button"
          className={rowStyle}
          style={{ paddingLeft: 4 + depth * 16 }}
          aria-expanded={open}
          onClick={() =>
            setClosed((current) =>
              open ? [...current, key] : current.filter((id) => id !== key),
            )
          }
        >
          <span className={chevronSlotStyle}>
            <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
          </span>
          <Tile icon="diagramNested" tone="neutral" />
          <span className={labelStyle}>In parallel</span>
          {groupCount(`${together.length} steps`)}
        </button>,
        ...(open ? stepRows(together, depth + 1, withParallel) : []),
      ];
    });
  };

  return (
    <div className={css({ display: "flex", flexDirection: "column" })}>
      <div className={listHeadStyle}>
        <span>{total === 1 ? "1 step" : `${total} steps`}</span>
        {/* 2 Nov: a DS IconButton (ghost, xs, neutral), not a blue link. Figma draws lucide fold-vertical; ds-components
            has no fold icon, so its collapse / expand glyphs stand in. */}
        <Button
          size="xs"
          variant="ghost"
          tone="neutral"
          iconName={allClosed ? "expand" : "collapse"}
          aria-label={allClosed ? "Expand all" : "Collapse all"}
          tooltip={allClosed ? "Expand all" : "Collapse all"}
          onClick={() => setClosed(allClosed ? [] : groups)}
        />
      </div>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          paddingX: "2",
        })}
      >
        <button
          type="button"
          className={rowStyle}
          aria-current={ui.selectedId === START_ID || undefined}
          onClick={() => select(START_ID)}
        >
          <span className={chevronSlotStyle} />
          <Tile icon="play" tone="neutral" />
          <span className={labelStyle}>
            {document.startDescription || "Flow inputs"}
          </span>
          {mark(START_ID)}
        </button>
        {withParallel(document.steps, 0)}
        {flowTake === 4 || flowTake === 5 ? (
          <button
            type="button"
            className={rowStyle}
            aria-current={ui.selectedId === FLOW_OUTPUTS_ID || undefined}
            data-flow-row={FLOW_OUTPUTS_ID}
            onClick={() => select(FLOW_OUTPUTS_ID)}
          >
            <span className={chevronSlotStyle} />
            <Tile icon="rightToLine" tone="neutral" />
            <span className={labelStyle}>
              {starCopy ? "Featured outputs" : flowTake === 4 ? "Flow outputs" : "Outputs"}
            </span>
            <span className={flowCountStyle}>
              {flaggedOutputsOf(document).length}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
};

/** Where a step from the library goes: after the selected step, else after the end of the main line. */
const placeFromLibrary = (
  document: EditorDocument,
  ui: EditorUi,
  entry: CatalogEntry,
) => {
  const selected = ui.selectedId;
  const selectedStep = selected ? findStep(document, selected) : undefined;
  const danglingEnd = [...document.steps]
    .reverse()
    .map((step) => step.stepId)
    .concat(START_ID)
    .find((id) => !document.wires.some((wire) => wire.source === id));
  const after =
    selected === START_ID ||
    (selectedStep && selectedStep.step.kind !== "for-each")
      ? { stepId: selected!, port: "next" }
      : danglingEnd
        ? { stepId: danglingEnd, port: "next" }
        : undefined;
  return addStep(document, entry.id, { after });
};

/** "Add steps": search, then the groups collapsed; click a step to add it after the selected one. */
const Library = () => {
  const { document, setDocument, ui, setUi } = useEditor();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const query = search.trim().toLowerCase();
  const add = (entry: CatalogEntry) => {
    const { document: next, stepId } = placeFromLibrary(document, ui, entry);
    setDocument(() => next);
    setUi((current) => ({
      ...current,
      selectedId: stepId,
      recent: [
        entry.id,
        ...current.recent.filter((id) => id !== entry.id),
      ].slice(0, 4),
    }));
  };
  const entryRow = (entry: CatalogEntry, indent: boolean) => (
    <button
      key={entry.id}
      type="button"
      className={rowStyle}
      // A group's steps sit one 16 px level in, like the Steps tree.
      style={indent ? { paddingLeft: 20 } : undefined}
      title={entry.description}
      onClick={() => add(entry)}
    >
      <span className={chevronSlotStyle} />
      <Tile icon={entry.icon} tone={entry.tone} />
      <span className={labelStyle}>{entry.title}</span>
    </button>
  );
  // `?picker=1..4` only: the same picker as the canvas, laid flat in the tab.
  const take = pickerTake();
  if (take) {
    const selectedStep =
      ui.selectedId && ui.selectedId !== START_ID
        ? findStep(document, ui.selectedId)?.step
        : undefined;
    return (
      <InlineStepPicker
        take={take}
        title="Add a step"
        context={
          selectedStep
            ? `After ${stepTitle(selectedStep)}`
            : ui.selectedId === START_ID
              ? "After Start"
              : "At the end of the flow"
        }
        entries={catalog.filter(isOffered)}
        recent={ui.recent.flatMap((id) =>
          catalog.filter((entry) => entry.id === id),
        )}
        onPick={add}
      />
    );
  }
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "2",
        padding: "2",
      })}
    >
      <TextInput
        value={search}
        onChange={setSearch}
        placeholder="Search"
        size="sm"
        prefix={{ iconName: "search", variant: "subtle" }}
      />
      <div className={css({ display: "flex", flexDirection: "column" })}>
        {query
          ? catalog
              .filter(
                (entry) =>
                  entry.title.toLowerCase().includes(query) ||
                  entry.category.toLowerCase().includes(query),
              )
              .map((entry) => entryRow(entry, false))
          : stepGroups.map(({ name: category, ...group }) => {
              const entries = groupEntries(
                { name: category, ...group },
                catalog,
              );
              const expanded = open.includes(category);
              return (
                <div key={category}>
                  <button
                    type="button"
                    className={rowStyle}
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((current) =>
                        expanded
                          ? current.filter((name) => name !== category)
                          : [...current, category],
                      )
                    }
                  >
                    <span className={chevronSlotStyle}>
                      <Icon
                        name={expanded ? "chevronDown" : "chevronRight"}
                        size="xs"
                      />
                    </span>
                    <span className={labelStyle}>{category}</span>
                    <span className={countStyle}>
                      {entries.length}
                    </span>
                  </button>
                  {expanded
                    ? entries.map((entry) => entryRow(entry, true))
                    : null}
                </div>
              );
            })}
      </div>
    </div>
  );
};

/**
 * The panel header (3 Nov layout, J1.4 `806:62678`): 40 px, 8 px in, with a hairline along its whole bottom edge.
 * The tabs sit on that edge.
 */
const headerStyle = css({
  display: "flex",
  alignItems: "flex-end",
  flexShrink: 0,
  height: "[40px]",
  paddingLeft: "2",
  paddingRight: "3",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

/**
 * Figma DS `Tabs` variant=underlined, size=md, with the Tabs' own border removed (the header's hairline stands in for
 * it): 32 px items 10 px in, 20 px apart, 14 px medium, the selected one dark and the other grey. Figma draws no
 * indicator under the selected tab, so none is drawn here.
 *
 * DS gap: ds-components has no Tabs, so this is a local tablist.
 */
const tabListStyle = css({
  display: "flex",
  gap: "5",
});

const tabStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[32px]",
  paddingX: "[10px]",
  textStyle: "sm",
  lineHeight: "none",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _hover: { color: "neutral.fg.heading" },
  _focusVisible: { outline: "[2px solid var(--flows-sel-border)]" },
  "&[aria-selected=true]": { color: "neutral.fg.heading" },
});

const panelTabs = [
  { value: "steps", label: "Steps", region: "Steps" },
  { value: "add", label: "Add", region: "Add a step" },
] as const;

/** The editor's left panel. In a run (`statusFor`) it is the Steps tree only, read-only, with each step's run mark. */
export const LeftPanel = ({
  statusFor,
}: {
  statusFor?: (stepId: string) => StepRun;
}) => {
  const { ui, setUi } = useEditor();
  const panel = statusFor ? "steps" : (ui.leftPanel ?? "steps");
  const current = panelTabs.find((tab) => tab.value === panel)!;
  return (
    <aside className={panelStyle} aria-label={current.region}>
      <div className={headerStyle}>
        <div role="tablist" aria-label="Left panel" className={tabListStyle}>
          {(statusFor ? panelTabs.slice(0, 1) : panelTabs).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={tab.value === panel}
              className={tabStyle}
              onClick={() =>
                setUi((state) => ({ ...state, leftPanel: tab.value }))
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <OverlayScrollArea className={css({ flex: "1", minHeight: "[0]" })}>
        {panel === "add" ? <Library /> : <FlowList statusFor={statusFor} />}
      </OverlayScrollArea>
    </aside>
  );
};
