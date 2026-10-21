import { useState } from "react";

import {
  Button,
  Icon,
  type IconName,
  TextInput,
} from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import { type CatalogEntry, catalog, categories } from "./catalog";
import {
  START_ID,
  addStep,
  type DraftStep,
  type EditorDocument,
  findStep,
  stepLabel,
} from "./document";
import { type EditorUi, useEditor } from "./editor-context";
import { triggerDefinitions } from "./mock-triggers";

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
  backgroundColor: "neutral.s00",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.a40",
});

/** The DS Tabs header: 40 px, 12 px in on the left, tabs 20 px apart, then a divider and an icon button. */
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[41px]",
  paddingLeft: "3",
  paddingRight: "2",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.a40",
  flexShrink: 0,
});

const tabStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[40px]",
  paddingX: "[3px]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s90",
  borderBottomWidth: "[2px]",
  borderBottomStyle: "solid",
  borderBottomColor: "[transparent]",
  marginBottom: "[-1px]",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _hover: { color: "neutral.s120" },
  "&[aria-selected=true]": {
    color: "neutral.s120",
    borderBottomColor: "neutral.s70",
  },
});

/** A D19 A row: 32 px, 4 px in, 6 px corners, a 12 px chevron slot, a 20 px tile and a 13 px label. */
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "[100%]",
  height: "[32px]",
  paddingX: "1",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "[13px]",
  lineHeight: "[18px]",
  color: "neutral.s120",
  _hover: { backgroundColor: "neutral.a20" },
  _focusVisible: { backgroundColor: "neutral.a20", outline: "none" },
  "&[aria-current=true]": { backgroundColor: "neutral.a30" },
});

const chevronSlotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[12px]",
  height: "[16px]",
  color: "neutral.s90",
  "& svg": { width: "[10px]", height: "[10px]" },
});

const tileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "[20px]",
    height: "[20px]",
    borderRadius: "sm",
    "&[class] svg": {
      width: "[12px]",
      height: "[12px]",
      "--icon-size": "12px",
    },
  },
  variants: {
    tone: {
      green: { backgroundColor: "green.s20", color: "green.s100" },
      orange: { backgroundColor: "orange.s20", color: "orange.s100" },
      blue: { backgroundColor: "blue.s20", color: "blue.s100" },
      neutral: { backgroundColor: "blue.s20", color: "neutral.s100" },
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

const countStyle = css({ fontSize: "[11px]", color: "neutral.s90" });

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

/** "In this flow": triggers, Start, then the steps in order, children of a For each indented under it. */
const FlowList = () => {
  const { document, ui, setUi } = useEditor();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const select = (id: string) =>
    setUi((current) => ({ ...current, selectedId: id, openField: null }));

  const stepRows = (steps: DraftStep[], depth: number): React.ReactNode[] =>
    steps.flatMap((step) => {
      const look = stepLook(step);
      const open = !collapsed.includes(step.stepId);
      const row = (
        <button
          key={step.stepId}
          type="button"
          className={rowStyle}
          style={{ paddingLeft: 4 + depth * 14 }}
          aria-current={ui.selectedId === step.stepId || undefined}
          data-flow-row={step.stepId}
          onClick={() => select(step.stepId)}
        >
          <span
            className={chevronSlotStyle}
            onClick={(event) => {
              if (step.kind !== "for-each") {
                return;
              }
              event.stopPropagation();
              setCollapsed((current) =>
                open
                  ? [...current, step.stepId]
                  : current.filter((id) => id !== step.stepId),
              );
            }}
          >
            {step.kind === "for-each" ? (
              <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
            ) : null}
          </span>
          <Tile icon={look.icon} tone={look.tone} />
          <span className={labelStyle}>{stepLabel(step)}</span>
        </button>
      );
      return step.kind === "for-each" && open
        ? [row, ...stepRows(step.steps, depth + 1)]
        : [row];
    });

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        paddingX: "2",
        paddingY: "[3px]",
      })}
    >
      {document.triggers.map((trigger) => {
        const definition = triggerDefinitions[trigger.kind];
        return (
          <button
            key={trigger.id}
            type="button"
            className={rowStyle}
            aria-current={ui.selectedId === trigger.id || undefined}
            onClick={() => select(trigger.id)}
          >
            <span className={chevronSlotStyle} />
            <Tile icon={definition.icon} tone="blue" />
            <span className={labelStyle}>
              {trigger.description || definition.title}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className={rowStyle}
        aria-current={ui.selectedId === START_ID || undefined}
        onClick={() => select(START_ID)}
      >
        <span className={chevronSlotStyle} />
        <Tile icon="play" tone="neutral" />
        <span className={labelStyle}>
          {document.startDescription || "Start"}
        </span>
      </button>
      {stepRows(document.steps, 0)}
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
      style={indent ? { paddingLeft: 18 } : undefined}
      title={entry.description}
      onClick={() => add(entry)}
    >
      {indent ? null : <span className={chevronSlotStyle} />}
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
          : categories.map((category) => {
              const entries = catalog.filter(
                (entry) => entry.category === category,
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
                    <span className={countStyle}>{entries.length}</span>
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

export const LeftPanel = () => {
  const [tab, setTab] = useState<"flow" | "add">("flow");
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <div
        className={css({
          position: "absolute",
          top: "3",
          left: "3",
          zIndex: "[5]",
        })}
      >
        <Button
          size="sm"
          variant="subtle"
          iconName="sidebar"
          aria-label="Show the steps panel"
          tooltip="Show the steps panel"
          onClick={() => setCollapsed(false)}
        />
      </div>
    );
  }
  return (
    <aside className={panelStyle} aria-label="Steps">
      <div className={headerStyle}>
        <div
          role="tablist"
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "5",
            flex: "1",
            minWidth: "[0]",
          })}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "flow"}
            className={tabStyle}
            onClick={() => setTab("flow")}
          >
            In this flow
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "add"}
            className={tabStyle}
            onClick={() => setTab("add")}
          >
            Add steps
          </button>
        </div>
        <span
          className={css({
            width: "[1px]",
            height: "[20px]",
            backgroundColor: "neutral.a40",
          })}
        />
        <Button
          size="xs"
          variant="ghost"
          iconName="sidebar"
          aria-label="Hide the steps panel"
          tooltip="Hide the steps panel"
          onClick={() => setCollapsed(true)}
        />
      </div>
      <OverlayScrollArea className={css({ flex: "1", minHeight: "[0]" })}>
        {tab === "flow" ? <FlowList /> : <Library />}
      </OverlayScrollArea>
    </aside>
  );
};
