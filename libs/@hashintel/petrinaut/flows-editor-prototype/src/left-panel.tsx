import { useState } from "react";

import {
  Button,
  Icon,
  type IconName,
  SegmentedControl,
  TextInput,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import {
  type CatalogEntry,
  catalog as fullCatalog,
  groupEntries,
  stepGroups,
  isOffered,
} from "./catalog";

/** Manual journeys only (ledger, 21 Oct): AI steps are parked. */
const catalog = fullCatalog.filter(isOffered);
import {
  START_ID,
  addStep,
  type DraftStep,
  type EditorDocument,
  findStep,
  flattenSteps,
  stepLabel,
  stepTitle,
} from "./document";
import { type EditorUi, useEditor } from "./editor-context";
import { mockRuns, runStatus } from "./mock-runs";

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
    backgroundColor: "neutral.bgSolid.surface.active",
    "&[class] svg": {
      width: "[10px]",
      height: "[10px]",
      "--icon-size": "10px",
    },
  },
  variants: {
    tone: {
      green: { color: "green.fg.muted" },
      orange: { color: "orange.fg.muted" },
      blue: { color: "blue.fg.muted" },
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

const Tile = ({ icon, tone }: { icon: IconName; tone: Tone }) => (
  <span className={tileStyle({ tone })}>
    <Icon name={icon} size="sm" />
  </span>
);

const stepLook = (step: DraftStep): { icon: IconName; tone: Tone } => {
  if (step.kind === "for-each") {
    return { icon: "rotate", tone: "green" };
  }
  const entry = catalog.find(
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
  paddingRight: "4",
  textStyle: "xs",
  color: "neutral.fg.muted",
});

/** "In this flow": Start, then the steps in order, children of a For each indented under it. */
const FlowList = () => {
  const { document, ui, setUi } = useEditor();
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
            <span className={cx(labelStyle, css({ fontWeight: "semibold" }))}>
              {stepLabel(step)}
            </span>
            <span className={countStyle}>
              {inside === 1 ? "1 step" : `${inside} steps`}
            </span>
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
          <span className={cx(labelStyle, css({ fontWeight: "semibold" }))}>
            In parallel
          </span>
          <span className={countStyle}>{together.length} steps</span>
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
        </button>
        {withParallel(document.steps, 0)}
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
        placeholder="Search steps"
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
                      {entries.length === 1
                        ? "1 step"
                        : `${entries.length} steps`}
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

/** Option F's rail (2 Nov): 44 px, white, a hairline on its right, the DS SegmentedControl standing up in it. */
const railStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flexShrink: 0,
  width: "[44px]",
  height: "[100%]",
  paddingTop: "2",
  backgroundColor: "neutral.bgSolid.min",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

/** The panel's title: "Steps", "Add a step", "Runs", 14 px semibold, 8 px in, in a 40 px header. */
const panelTitleStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  height: "[40px]",
  paddingX: "2",
  textStyle: "sm",
  fontWeight: "semibold",
  color: "neutral.fg.heading",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const panelTitles = {
  steps: "Steps",
  add: "Add a step",
  runs: "Runs",
} as const;

/** Runs (Explorations 903:39224): the flow's runs, newest first; one picked shows on the canvas. */
const RunsList = () => {
  const { document, ui, setUi } = useEditor();
  const runs = mockRuns(document);
  if (runs.length === 0) {
    return (
      <div
        className={css({
          paddingX: "4",
          paddingY: "3",
          textStyle: "sm",
          color: "neutral.fg.subtle",
        })}
      >
        No runs yet. Runs show here once the flow is published and starts.
      </div>
    );
  }
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[1px]",
        padding: "2",
        paddingTop: "4",
      })}
    >
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          aria-current={ui.viewRunId === run.id || undefined}
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "[2px]",
            paddingX: "2",
            paddingY: "1.5",
            borderRadius: "md",
            textAlign: "left",
            cursor: "pointer",
            _hover: { backgroundColor: "neutral.bg.surface.active" },
            "&[aria-current=true]": {
              backgroundColor: "neutral.bg.subtle",
            },
          })}
          onClick={() =>
            setUi((current) => ({
              ...current,
              viewRunId: run.id,
              // The run shows on the canvas alone, as Explorations 903:39224 draws it.
              selectedId: null,
              selectedIds: [],
              picker: null,
              openField: null,
            }))
          }
        >
          <span
            className={css({ textStyle: "sm", color: "neutral.fg.heading" })}
          >
            {run.when}
          </span>
          <span
            className={css({
              textStyle: "xs",
              color: run.failedAt ? "red.fg.body" : "green.fg.body",
            })}
          >
            {runStatus(run)}
          </span>
        </button>
      ))}
    </div>
  );
};

export const LeftPanel = () => {
  const { ui, setUi } = useEditor();
  const panel = ui.leftPanel ?? "steps";
  return (
    <>
      <nav className={railStyle} aria-label="Panels">
        <SegmentedControl
          aria-label="Panels"
          layout="vertical"
          size="md"
          value={panel}
          onChange={(next) =>
            setUi((current) => ({
              ...current,
              leftPanel: next,
              // Leaving Runs goes back to editing.
              viewRunId: next === "runs" ? current.viewRunId : null,
            }))
          }
          items={[
            { value: "steps", iconName: "list", tooltip: "Steps" },
            { value: "add", iconName: "plus", tooltip: "Add a step" },
            { value: "runs", iconName: "clockRotateLeft", tooltip: "Runs" },
          ]}
        />
      </nav>
      <aside className={panelStyle} aria-label={panelTitles[panel]}>
        <div className={panelTitleStyle}>{panelTitles[panel]}</div>
        <OverlayScrollArea className={css({ flex: "1", minHeight: "[0]" })}>
          {panel === "steps" ? (
            <FlowList />
          ) : panel === "add" ? (
            <Library />
          ) : (
            <RunsList />
          )}
        </OverlayScrollArea>
      </aside>
    </>
  );
};
