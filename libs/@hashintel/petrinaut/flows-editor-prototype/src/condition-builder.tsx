/**
 * The condition builder of Find entities, If and Filter list, on the DS `Filter` as Figma J3 draws it (section
 * 470:3681, 21 Oct): each condition is one line: a fixed-width joiner column ("Where", then an "and ▾" / "or ▾" menu), the Filter chip (attribute · operator · value) and a ⋮ menu; grey groups hold their own rows, "Add filter" and "Delete group". The builder's footer is "Add filter" and "Clear all filters". Operators follow the
 * attribute's type, and each value's menu ends in "Use a variable" (the same picker as "@").
 *
 * MOCK, editor side only: relative dates ("Today", "3 days ago") and "is in month". The engine's condition values are
 * fixed (Attio teardown, 21 Oct); these are marked in their hover.
 *
 * Where the DS Filter stops (its value is a text, number or select input):
 * - an exact date or "N days ago" opens the DS datePicker composition (`DatePickerSurface`) from the value's menu;
 * - a variable shows as the value's selected item (its step's icon, step name first, middle collapsed);
 * - "@" in a text value opens the variable picker beside the field, which keeps focus (no DS mention input).
 */
import { type PointerEvent, useEffect, useRef, useState } from "react";

import {
  Button,
  Filter,
  type FilterOperator,
  Icon,
  Menu,
  type MenuItem,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { HashIcon } from "@hashintel/ds-icons";

import {
  type CatalogEntry,
  stepOutputs,
  humanize,
  type InputView,
} from "./catalog";
import {
  DatePopover,
  formatDate,
  months,
  relativeLabel,
  relativePresets,
  relativeRowStyle,
  today,
} from "./date-picker";
import {
  type ConditionOperator,
  type ConditionRow,
  type DraftActionStep,
  type EditorDocument,
  findStep,
  type IntervalUnit,
  itemName,
  itemPropertyOf,
  type QueryDraft,
  type QueryGroup,
  type RelativeDate,
  stepLabel,
  VALUE_SUBJECT,
} from "./document";
import { useEditor, useSourceHover } from "./editor-context";
import {
  findPropertyType,
  type MockPropertyType,
  mockEntities,
  mockEntityTypes,
} from "./mock-graph";
import { selectedLabel } from "./menu-rows";
import { SourceMenu } from "./source-menu";
import { conditionLayout, joinerTake } from "./switch-flags";
import { refLook, RefTileOutput } from "./ref-path";

import { oldLabelColumn } from "./ui";

import type { StepInputSource } from "./engine";

/* ----------------------------------------------------------------------------------------------------------------
 * Operators by type
 * ------------------------------------------------------------------------------------------------------------- */

type ValueType = "date" | "number" | "options" | "entity" | "boolean" | "text";

export const valueTypeOf = (
  property:
    Pick<MockPropertyType, "payloadKind" | "options" | "linksTo"> | undefined,
): ValueType =>
  property?.linksTo
    ? "entity"
    : property?.options
      ? "options"
      : property?.payloadKind === "Date"
        ? "date"
        : property?.payloadKind === "Number"
          ? "number"
          : property?.payloadKind === "Boolean"
            ? "boolean"
            : "text";

type OperatorChoice = {
  value: ConditionOperator;
  text: string;
  takesValue: boolean;
  mock?: string;
};

const empty: OperatorChoice[] = [
  { value: "isEmpty", text: "is empty", takesValue: false },
  { value: "isNotEmpty", text: "is not empty", takesValue: false },
];

/** The operators a type takes (Attio's per-type lists, mapped to the engine's operators). */
export const operatorsFor = (
  type: ValueType,
  forGraph: boolean,
): { label: string; items: OperatorChoice[] } => {
  switch (type) {
    case "date":
      return {
        label: "Date operators",
        items: [
          { value: "equals", text: "is", takesValue: true },
          { value: "greaterThan", text: "after", takesValue: true },
          {
            value: "greaterThanOrEqual",
            text: "at or after",
            takesValue: true,
          },
          { value: "lessThan", text: "before", takesValue: true },
          { value: "lessThanOrEqual", text: "at or before", takesValue: true },
          {
            value: "isIn",
            text: "is in month",
            takesValue: true,
            mock: "Editor mock: the engine compares fixed dates only.",
          },
          ...empty,
        ],
      };
    case "number":
      return {
        label: "Number operators",
        items: [
          { value: "equals", text: "is", takesValue: true },
          { value: "notEquals", text: "is not", takesValue: true },
          { value: "greaterThan", text: "greater than", takesValue: true },
          { value: "greaterThanOrEqual", text: "at least", takesValue: true },
          { value: "lessThan", text: "less than", takesValue: true },
          { value: "lessThanOrEqual", text: "at most", takesValue: true },
          ...empty,
        ],
      };
    case "entity":
      return {
        label: "Link operators",
        items: [
          { value: "equals", text: "is", takesValue: true },
          { value: "isAnyOf", text: "is any of", takesValue: true },
          ...empty,
        ],
      };
    case "boolean":
      return {
        label: "Yes or no",
        items: [{ value: "equals", text: "is", takesValue: true }, ...empty],
      };
    case "options":
      return {
        label: "Status operators",
        items: [
          { value: "equals", text: "is", takesValue: true },
          { value: "notEquals", text: "is not", takesValue: true },
          ...empty,
        ],
      };
    default:
      return {
        label: "Text operators",
        items: [
          { value: "equals", text: "is", takesValue: true },
          { value: "notEquals", text: "is not", takesValue: true },
          // The graph's filter has no plain "contains" for text, so Find entities can't offer it.
          ...(forGraph
            ? []
            : [
                {
                  value: "contains" as const,
                  text: "contains",
                  takesValue: true,
                },
              ]),
          ...empty,
        ],
      };
  }
};

/** The last 12 months, for "is in month" (mock). */
const recentMonths = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(today.year, today.month - index, 1));
  return {
    value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    text: `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
  };
});

/**
 * The rendered stroke of the canvas toolbar's Hand and Select icons (DS `Icon`, 16 px): measured 1.25 px on 21 Oct.
 * The variable glyph matches it at any size, so it reads at the same weight beside them and beside DS menu icons.
 */
const TOOL_ICON_STROKE_PX = 1.25;

/** A variable, as Figma J3 draws it: the ds-icons `variableBrackets` glyph ([x]), at the toolbar icons' weight. */
export const VariableIcon = ({ size = 12 }: { size?: number }) => (
  <HashIcon
    name="variableBrackets"
    size={size}
    strokeWidth={(TOOL_ICON_STROKE_PX * 24) / size}
  />
);

/** "Use a variable" as a DS menu or select row: the glyph where a DS item draws its icon, then the label. */
const variableRowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  "& svg": { color: "neutral.fg.muted", flexShrink: 0 },
});

const VariableRow = ({ label = "Use a variable" }: { label?: string }) => (
  <span className={variableRowStyle}>
    <VariableIcon size={14} />
    {label}
  </span>
);

/* ----------------------------------------------------------------------------------------------------------------
 * Variable tokens
 * ------------------------------------------------------------------------------------------------------------- */

export type BuilderProperty = {
  baseUrl: string;
  title: string;
  property?: MockPropertyType;
};

/** A variable's path: the step's name ("Shipments this month"), plus an output that is not the main one ("Failed batches › Count"); a flow input is its own name ("Review month"). */
export const tokenPath = (
  document: EditorDocument,
  source: StepInputSource,
  stepId?: string,
): string[] => {
  if (source.kind === "flow-input") {
    const input = document.inputs.find(
      (candidate) => candidate.name === source.inputName,
    );
    return [input?.label ?? source.inputName];
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    if (!step) {
      return [source.stepId];
    }
    // The step's own name; its output's name only when it is not the step's main output.
    const outputs =
      step.kind === "action"
        ? stepOutputs(step)
        : [];
    const output = outputs.find(
      (candidate) => candidate.name === source.outputName,
    );
    return step.kind === "action" && outputs[0]?.name === source.outputName
      ? [stepLabel(step)]
      : [stepLabel(step), output?.label ?? humanize(source.outputName)];
  }
  if (source.kind === "item") {
    const parentId = stepId ? findStep(document, stepId)?.parentId : undefined;
    const name = parentId ? itemName(document, parentId) : "item";
    const property = itemPropertyOf(source);
    return property ? [name, property.title] : ["For each", name];
  }
  return [String(source.payload.value)];
};

/** Long paths collapse their middle to "…" (Attio); the hover shows the whole path. */
export const collapsePath = (parts: string[]) =>
  parts.length > 2
    ? [parts[0], "…", parts.at(-1)].join(" › ")
    : parts.join(" › ");

/* ----------------------------------------------------------------------------------------------------------------
 * One condition row: a DS Filter chip and its ⋮ menu
 * ------------------------------------------------------------------------------------------------------------- */

/** Value-menu rows that act instead of setting a value. */
const VARIABLE = "__variable";
const TOKEN = "__token";
const TYPED = "__typed";
const SHOW_STEP = "__showStep";
/** A date row with no date yet: the chip shows the calendar icon before "Select date…". */
const NO_DATE = "__noDate";

const relativeKey = (relative: RelativeDate) =>
  relative.kind === "daysAgo"
    ? `rel:daysAgo:${relative.days}`
    : relative.kind === "interval"
      ? `rel:interval:${relative.amount}:${relative.unit}:${relative.direction}:${relative.anchor}`
      : `rel:${relative.kind}`;

const parseRelative = (key: string): RelativeDate | undefined => {
  const [, kind, days, unit, direction, anchor] = key.split(":");
  if (kind === "daysAgo") {
    return { kind: "daysAgo", days: Number(days) };
  }
  if (kind === "interval") {
    return {
      kind,
      amount: Number(days),
      unit: unit as IntervalUnit,
      direction: direction as "ago" | "fromNow",
      anchor: anchor as "stepRun" | "flowStart",
    };
  }
  return relativePresets.find((preset) => preset.value.kind === kind)?.value;
};

/** One line: the joiner column, then the chip (Figma Q8: 4 px between). */
export const rowStackStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  alignSelf: "stretch",
  minWidth: "[0]",
});

/**
 * The panel's label column (`minmax(88px, 30%)` in `ui.tsx`; 120 px cap under `?labelcol=old`), measured on the
 * builder, which spans both columns. Its top-level joiner takes this width, so its chips start at the value column,
 * level with every other field.
 */
export const labelColumnStyle = css({
  containerType: "inline-size",
  "--flows-label-column": "max(88px, 30cqw)",
});

/**
 * `?switchlayout=a|b|c` (inbox `condition-panels-layout`): the DS Filter's 8 px between rows (Figma DS `41967:40965`);
 * `c` also takes its 64 px joiner column. The Switch panel reads the same styles, so the three panels share one layout.
 */
export const takeColumnStyle = css({
  "&[class]": { "--flows-label-column": "[64px]" },
});

export const takeRowsStyle = css({ "&[class]": { gap: "2" } });

/** `b`, `c`: the Add button under the joiner, at the builder's left edge, as the DS Filter's footer. */
export const takeFooterAtEdge = conditionLayout === "b" || conditionLayout === "c";

const oldLabelColumnWidthStyle = css({
  "--flows-label-column": "max(88px, min(30cqw, 120px))",
});

/**
 * The joiner column, so the chips share one left edge: the panel's label column at the top level, 56 px inside a group
 * (Figma Filter label). The joiner keeps its own width and may run past the column, as Figma's does.
 */
const joinerColumnStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  width: "var(--flows-label-column)",
  "[data-condition-group] &": { width: "[56px]" },
  "& button": { flexShrink: 0 },
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

/** Full-width rows (field-conditions 2): the joiner on its own line above its chip, which spans the builder. */
export const fullRowStackStyle = css({
  "&[class]": { flexDirection: "column", alignItems: "stretch", gap: "2" },
  "& > [data-joiner]": { width: "[auto]" },
});

/**
 * The chip across the row, one line high like the DS Filter: the value takes what's left, and long text in any segment
 * ends in "…" (the whole condition shows on hover). The attribute and operator take at most 38 % so the value keeps
 * room.
 */
export const fullChipStyle = css({
  "& [data-condition-row] > span:first-child, & [data-chip] > *": {
    flex: "1",
    minWidth: "[0]",
    display: "flex",
  },
  "& [role=group][data-property]": {
    display: "flex",
    flex: "1",
    width: "[100%]",
    alignItems: "center",
  },
  "& [role=group][data-property] > span": {
    minWidth: "[0]",
    overflow: "hidden",
  },
  "& [role=group][data-property] > span:not([data-part])": {
    flex: "[0 1 auto]",
    maxWidth: "[38%]",
  },
  "& [role=group][data-property] > [data-part=input-slot]": {
    flex: "1",
    maxWidth: "[none]",
  },
  "& [role=group][data-property] *": {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "& [data-part=input-slot] *": {
    textAlign: "left",
    justifyContent: "flex-start",
  },
  "& [data-part=input-slot] button, & [data-part=input-slot] [data-part=trigger]": {
    width: "[100%]",
  },
});

/** The whole condition as a native hover title, read from what the row shows. */
export const showConditionOnHover = (event: PointerEvent<HTMLElement>) => {
  const element = event.currentTarget;
  element.title = element.innerText.replace(/\s*\n+\s*/g, " ").trim();
};

/** The joiner as "Where" reads: plain muted lowercase text, its chevron on hover; a click opens the menu. */
const fullJoinerStyle = css({ "&[class]": { height: "[auto]" } });

/** A row: the chip, then its ⋮ segment, on one line. */
export const rowStyle = css({
  display: "flex",
  alignItems: "stretch",
  gap: "[0]",
  flex: "1",
  minWidth: "[0]",
  "& [data-part=filter-root], & [role=group][data-property]": {
    flexShrink: 1,
    minWidth: "[0]",
  },
});

/** The DS Tooltip's trigger is a line-height 0 span; around a value it must size to its text. */
const tipStyle = css({
  "&[class]": {
    display: "inline-flex",
    minWidth: "[0]",
    maxWidth: "[100%]",
    lineHeight: "[inherit]",
  },
});

/**
 * One line, at the panel's body text size (the DS Filter's sm is 12 px, the panel's text 14 px; Figma J3 draws the chip
 * at the panel's size). The attribute and operator stay whole ("Shipment · is any of", J3 · B3); a long value takes the
 * overflow and ends in "…". The ⋮ that follows is the chip's last segment, so the chip's own last corners square off.
 * Layout and type size only: the chip's parts keep their DS look.
 */
export const filterFitStyle = css({
  "&[class]": {
    textStyle: "sm",
    "--filter-font-size": "[1em]",
    "--filter-input-padding-x": "[6px]",
  },
  "&[class] > [data-part='property'], &[class] > [data-scope='select'][data-part='trigger']":
    { flexShrink: 0 },
  "&[class] > [data-part='input-slot']": {
    flexShrink: 1,
    minWidth: "[0]",
    maxWidth: "[100%]",
  },
  // The DS pads a select value twice (its button and its label); Figma draws it once.
  "&[class] > [data-part='input-slot'] button > [data-part='trigger']": {
    paddingInline: "[0]",
  },
  // The DS Filter draws its outline on the segments and clips them with the root's radius, so the root and its last
  // segment square off together, and only while the ⋮ shows; otherwise the clip cuts the square border's corners.
  "[data-condition-row]:is(:hover, :focus-within) &[class], [data-condition-row]:has([aria-label='Condition options'][aria-expanded=true]) &[class]":
    {
      borderStartEndRadius: "[0]",
      borderEndEndRadius: "[0]",
      "& > :last-child": {
        borderStartEndRadius: "[0]",
        borderEndEndRadius: "[0]",
      },
    },
});

/** The ⋮ as the chip's last segment: the chip's hairline on three sides, its divider on the left. */
export const menuSegmentStyle = css({
  // 2 Nov: a row's ⋮ shows while the row is hovered, focused or its menu is open.
  "[data-condition-row]:not(:hover):not(:focus-within) &": {
    "&[class]:not([aria-expanded=true])": { display: "none" },
  },
  "&[class]": {
    alignSelf: "stretch",
    flexShrink: 0,
    height: "[auto]",
    minHeight: "[0]",
    width: "[22px]",
    minWidth: "[0]",
    paddingInline: "[0]",
    borderRadius: "[0]",
    borderStartEndRadius: "[5px]",
    borderEndEndRadius: "[5px]",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderInlineStartWidth: "[0]",
  },
});

/** The selected variable in a value slot: its step's icon, then the path. */
const tokenValueStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  "& > svg": { flexShrink: 0, color: "neutral.fg.muted" },
  "& > span": { overflow: "hidden", textOverflow: "ellipsis" },
  "&[data-empty] > span": { color: "neutral.fg.subtle" },
});

/**
 * A token's text: the step's name, then the attribute it supplies after "›" ("Shipments this month › Received
 * date", J3 · C1b). It stays on the chip's line; a long step name shortens with "…" and the attribute stays whole.
 */
const tokenLabelStyle = css({
  display: "inline-flex",
  // The space around "›": flex items drop their own leading spaces.
  gap: "[0.3em]",
  minWidth: "[0]",
  whiteSpace: "nowrap",
  "& > [data-first]": {
    minWidth: "[1ch]",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "& > :not([data-first])": { flexShrink: 0 },
});

/** An entity as a value: the cube icon, then its name (J3 · A1). */
const EntityValue = ({ text }: { text: string }) => (
  <span className={tokenValueStyle}>
    <Icon name="cube" size="xs" />
    <span>{text}</span>
  </span>
);

/** Past this many characters the step's name gives way to "…" and the attribute stays whole (J3 · C1b). */
const fitsBesideLast = 24;

const TokenLabel = ({ parts }: { parts: string[] }) => {
  const [first = "", ...rest] = parts;
  const last = rest.at(-1);
  return (
    <span className={tokenLabelStyle} data-token-label>
      <span data-first>
        {last !== undefined && first.length + last.length > fitsBesideLast
          ? "…"
          : first}
      </span>
      {last === undefined ? null : (
        <span>{`${rest.length > 1 ? "› … › " : "› "}${last}`}</span>
      )}
    </span>
  );
};

type RowProps = {
  step: DraftActionStep;
  input: InputView;
  entry: CatalogEntry;
  row: ConditionRow;
  properties: BuilderProperty[];
  forGraph: boolean;
  prefix: React.ReactNode;
  onChange: (change: Partial<ConditionRow>) => void;
  onRemove: () => void;
  onGroup?: () => void;
  /** False where nothing runs before the condition (a trigger's): values are typed or picked, never variables. */
  allowVariables: boolean;
};

type SelectEntry = { value: string; text: string };

const ConditionRowView = ({
  step,
  input,
  entry,
  row,
  properties,
  forGraph,
  prefix,
  onChange,
  onRemove,
  onGroup,
  allowVariables,
}: RowProps) => {
  const { document, ui, setUi } = useEditor();
  const key = `${input.name}:condition${row.id}`;
  const openPart =
    ui.openField?.stepId === step.stepId &&
    ui.openField.inputName.startsWith(key)
      ? ui.openField.inputName.slice(key.length).replace(/^:/, "") || "variable"
      : null;
  const open = (
    part: "operator" | "value" | "variable" | null,
    mode: "menu" | "mention" | "custom" = "menu",
  ) =>
    setUi((current) => ({
      ...current,
      openField: part
        ? {
            stepId: step.stepId,
            inputName: part === "variable" ? key : `${key}:${part}`,
            mode,
          }
        : null,
    }));
  const [mention, setMention] = useState<string | undefined>(
    openPart === "variable" && ui.openField?.mode === "mention"
      ? ""
      : undefined,
  );
  // Remounts the Filter when a value-menu row acted instead of picking, so the chip shows the stored value again.
  const [resetCount, setResetCount] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  // The Filter's own text input, for "@": it keeps focus while the variable picker filters.
  const textRef = useRef<HTMLInputElement | null>(null);
  const valueSlotRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    textRef.current =
      rowRef.current?.querySelector<HTMLInputElement>(
        '[data-part="input-slot"] input',
      ) ?? null;
    // The value slot, or the whole row when the operator takes no value.
    valueSlotRef.current =
      rowRef.current?.querySelector<HTMLElement>('[data-part="input-slot"]') ??
      rowRef.current;
  });

  const subject = properties.find(
    (candidate) => candidate.baseUrl === row.propertyBaseUrl,
  );
  // A row with no attribute yet (the empty "Where" row) shows the attribute's slot, "Attribute".
  const title = subject?.title ?? (row.propertyBaseUrl ? "Value" : "Attribute");
  const property = subject?.property ?? findPropertyType(row.propertyBaseUrl);
  const type = valueTypeOf(property);
  const operators = operatorsFor(type, forGraph);
  const listOperator = row.operator === "isAnyOf";
  const valueInput: InputView = {
    name: key,
    label: title,
    array: listOperator,
    required: true,
    hasDefault: false,
    kinds: [property?.payloadKind ?? "Text"],
  };
  const linked = mockEntities.filter(
    (entity) =>
      !property?.linksTo || entity.entityTypeBaseUrl === property.linksTo,
  );
  const linkedType = mockEntityTypes.find(
    (candidate) => candidate.baseUrl === property?.linksTo,
  );

  // A screen state (?state=j3-a2…) opens a part of the chip: click it once mounted, as a user would.
  const initialPart = useRef(openPart);
  const currentOperator = row.operator;
  useEffect(() => {
    const part = initialPart.current;
    // Once: the state's part opens on the first mount only.
    initialPart.current = null;
    const root = rowRef.current;
    if (!root || (part !== "operator" && part !== "value")) {
      return;
    }
    if (part === "value" && type === "date" && currentOperator !== "isIn") {
      return; // The date surface is ours; it is already open.
    }
    const target =
      part === "operator"
        ? root.querySelector<HTMLElement>(`[aria-label="${title} operator"]`)
        : root.querySelector<HTMLElement>(
            '[data-part="input-slot"] [role="combobox"], [data-part="input-slot"] button',
          );
    target?.click();
  }, [title, type, currentOperator]);

  const close = () => {
    setMention(undefined);
    open(null);
  };

  /* The value's menu items, by type. Every menu ends in "Use a variable". */
  const variableItems: SelectEntry[] = allowVariables
    ? [{ value: VARIABLE, text: "Use a variable" }]
    : [];
  // MOCK: a lookup's chip ends with the attribute it supplies (Find entities › … › Received date, J3 C1b). The engine
  // hands the condition the whole found list.
  const lookupLeaf =
    row.valueSource?.kind === "step-output" &&
    row.valueSource.outputName === "entities" &&
    type !== "entity" &&
    !listOperator;
  const sourceHover = useSourceHover(row.valueSource, step.stepId);
  const tokenParts = row.valueSource
    ? [
        ...tokenPath(document, row.valueSource, step.stepId),
        ...(lookupLeaf ? [title] : []),
      ]
    : null;

  const tokenLook =
    row.valueSource && row.valueSource.kind !== "constant"
      ? refLook(document, row.valueSource, step.stepId)
      : null;

  const valueConfig = (): FilterOperator<Record<string, unknown>>["input"] => {
    if (row.valueSource && tokenParts) {
      return {
        type: "select",
        items: [
          { value: TOKEN, text: collapsePath(tokenParts) },
          ...(row.valueSource.kind === "step-output"
            ? [{ value: SHOW_STEP, text: `Show ${tokenParts[0]}` }]
            : []),
          { value: TYPED, text: "Type a value instead" },
          ...(allowVariables
            ? [{ value: VARIABLE, text: "Change variable" }]
            : []),
        ],
        renderSelectedItem: () => (
          // The DS Tooltip shows the whole path; the slot shows it collapsed (J3 · B3).
          <Tooltip
            content={tokenParts.join(" › ")}
            className={tipStyle}
            position="bottom"
          >
            <span
              className={tokenValueStyle}
              aria-label={`Change the source of ${title}`}
              onPointerEnter={sourceHover.onPointerEnter}
              onPointerLeave={sourceHover.onPointerLeave}
            >
              {tokenLook ? (
                // The step's tile, then the output name (condition-value-ref 3p); the hover gives the whole path.
                <RefTileOutput look={tokenLook} />
              ) : (
                // No icon: the step's name says where the value is from (ledger 23 Oct; Figma 643:22529).
                <TokenLabel parts={tokenParts} />
              )}
            </span>
          </Tooltip>
        ),
        renderItem: (value: string) =>
          value === VARIABLE ? (
            <VariableRow label="Change variable" />
          ) : value === TOKEN ? (
            collapsePath(tokenParts)
          ) : value === SHOW_STEP ? (
            `Show ${tokenParts[0]}`
          ) : (
            "Type a value instead"
          ),
      };
    }
    let items: SelectEntry[] = [];
    const renderItem = (value: string) =>
      value === VARIABLE ? (
        <VariableRow />
      ) : (
        (items.find((item) => item.value === value)?.text ?? value)
      );
    switch (type) {
      case "date": {
        if (row.operator === "isIn") {
          items = [...recentMonths, ...variableItems];
          break;
        }
        const exact =
          !row.relative && row.value !== null
            ? [
                {
                  value: `date:${String(row.value)}`,
                  text: formatDate(String(row.value)),
                },
              ]
            : [];
        const daysAgo =
          row.relative?.kind === "daysAgo" || row.relative?.kind === "interval"
            ? [
                {
                  value: relativeKey(row.relative),
                  text: relativeLabel(row.relative),
                },
              ]
            : [];
        items = [
          ...(row.value === null && !row.relative
            ? [{ value: NO_DATE, text: "Select date…" }]
            : []),
          ...exact,
          ...relativePresets.map((preset) => ({
            value: relativeKey(preset.value),
            text: preset.text,
          })),
          ...daysAgo,
        ];
        return {
          type: "select",
          items,
          placeholder: "Select date…",
          renderItem,
          renderSelectedItem: (value: string) => (
            <span
              className={tokenValueStyle}
              data-empty={value === NO_DATE || undefined}
            >
              <Icon name="calendar" size="xs" />
              <span>
                {items.find((item) => item.value === value)?.text ?? value}
              </span>
            </span>
          ),
        };
      }
      case "number":
        return { type: "number", placeholder: "0" };
      case "text":
        return {
          type: "string",
          placeholder: allowVariables ? "Value, or @" : "Value",
        };
      case "boolean":
        items = [
          { value: "true", text: "Yes" },
          { value: "false", text: "No" },
          ...variableItems,
        ];
        break;
      case "options":
        items = [
          ...(property?.options ?? []).map((option) => ({
            value: option,
            text: option,
          })),
          ...variableItems,
        ];
        break;
      case "entity":
        items = [
          ...linked.map((entity) => ({
            value: entity.entityId,
            text: entity.label,
          })),
          ...variableItems,
        ];
        if (listOperator) {
          return {
            type: "select",
            multiple: true,
            searchable: true,
            items,
            placeholder: `Select ${(linkedType?.pluralTitle ?? "records").toLowerCase()}…`,
            renderItem,
            // One line: the first pick, then "+N" (Aakarsh, 21 Oct).
            renderSelectedAll: (values: string[]) =>
              values.length === 0 ? null : (
                <EntityValue
                  text={`${items.find((item) => item.value === values[0])?.text ?? values[0]}${values.length > 1 ? ` +${values.length - 1}` : ""}`}
                />
              ),
          };
        }
        return {
          type: "select",
          searchable: true,
          items,
          placeholder: `Select a ${(linkedType?.title ?? "record").toLowerCase()}…`,
          renderItem,
          renderSelectedItem: (value: string) => (
            <EntityValue
              text={items.find((item) => item.value === value)?.text ?? value}
            />
          ),
        };
    }
    return {
      type: "select",
      items,
      placeholder: "Select…",
      renderItem,
    };
  };

  const filterOperators: FilterOperator<Record<string, unknown>>[] =
    operators.items.map((choice) => ({
      key: choice.value,
      label: choice.text,
      renderItem: choice.mock ? (
        <span title={choice.mock}>{choice.text}</span>
      ) : undefined,
      input: choice.takesValue ? valueConfig() : null,
    }));

  /* The stored row as the Filter's value. */
  const filterValue = (): unknown => {
    if (!row.operator) {
      return null;
    }
    const choice = operators.items.find((item) => item.value === row.operator);
    if (!choice?.takesValue) {
      return null;
    }
    if (row.valueSource) {
      return TOKEN;
    }
    switch (type) {
      case "date":
        if (row.operator === "isIn") {
          return row.value === null ? null : String(row.value);
        }
        return row.relative
          ? relativeKey(row.relative)
          : row.value === null
            ? NO_DATE
            : `date:${String(row.value)}`;
      case "number":
        return typeof row.value === "number" ? row.value : null;
      case "text":
        return (
          `${row.value === null ? "" : String(row.value)}${mention === undefined ? "" : `@${mention}`}` ||
          null
        );
      case "entity": {
        const ids = (row.values ?? []).map(
          (label) =>
            linked.find((entity) => entity.label === label)?.entityId ?? label,
        );
        return listOperator
          ? ids
          : row.value === null
            ? (ids[0] ?? null)
            : String(row.value);
      }
      default:
        return row.value === null ? null : String(row.value);
    }
  };

  /** A value-menu row that acts instead of storing a value: act, then show the stored value again. */
  const act = (run: () => void) => {
    run();
    setResetCount((count) => count + 1);
  };

  const apply = (operatorKey: string, value: unknown) => {
    const operator = operatorKey as ConditionOperator;
    if (operator !== row.operator) {
      onChange({
        operator,
        ...(operator === "isIn" || row.operator === "isIn"
          ? { value: null, relative: undefined }
          : {}),
        ...(operator === "isAnyOf" || row.operator === "isAnyOf"
          ? { values: undefined, value: null }
          : {}),
      });
      if (value === null) {
        return;
      }
    }
    const picks = Array.isArray(value)
      ? value.filter((pick): pick is string => typeof pick === "string")
      : null;
    // A select or text value is a string, a number value a number.
    const single =
      picks || (typeof value !== "string" && typeof value !== "number")
        ? null
        : value;
    if (single === VARIABLE || picks?.includes(VARIABLE)) {
      act(() => open("variable"));
      return;
    }
    if (single === TYPED) {
      act(() => onChange({ valueSource: undefined, value: null }));
      return;
    }
    if (single === SHOW_STEP) {
      const source = row.valueSource;
      act(() =>
        setUi((current) => ({
          ...current,
          selectedId: source?.kind === "step-output" ? source.stepId : null,
          openField: null,
        })),
      );
      return;
    }
    if (single === TOKEN || single === NO_DATE) {
      return;
    }
    switch (type) {
      case "date": {
        const text = single === null ? null : String(single);
        if (row.operator === "isIn" || operator === "isIn") {
          onChange({ value: text, relative: undefined });
        } else if (text?.startsWith("rel:")) {
          onChange({ relative: parseRelative(text), value: null });
        } else {
          onChange({
            value: text ? text.replace(/^date:/, "") : null,
            relative: undefined,
          });
        }
        return;
      }
      case "number":
        onChange({ value: typeof single === "number" ? single : null });
        return;
      case "text": {
        const next = single === null ? "" : String(single);
        const at = allowVariables ? next.lastIndexOf("@") : -1;
        if (at >= 0) {
          setMention(next.slice(at + 1));
          if (openPart !== "variable") {
            open("variable", "mention");
          }
          onChange({ value: next.slice(0, at) || null });
          return;
        }
        if (mention !== undefined) {
          setMention(undefined);
          open(null);
        }
        onChange({ value: next === "" ? null : next });
        return;
      }
      case "entity": {
        const ids = picks ?? (single === null ? [] : [String(single)]);
        const labels = ids.map(
          (id) => linked.find((entity) => entity.entityId === id)?.label ?? id,
        );
        onChange(
          picks
            ? { values: labels }
            : { values: labels, value: ids[0] ?? null },
        );
        return;
      }
      default:
        onChange({ value: single === null ? null : String(single) });
    }
  };

  const rowMenu: MenuItem[] = [
    ...(allowVariables
      ? [
          {
            id: "variable",
            text: <VariableRow />,
            onClick: () => open("variable"),
          },
        ]
      : []),
    ...(row.valueSource
      ? [
          {
            id: "typed",
            text: "Type a value instead",
            icon: "text" as const,
            onClick: () => onChange({ valueSource: undefined }),
          },
        ]
      : []),
    ...(onGroup
      ? [
          {
            id: "group",
            text: "Convert to advanced filter",
            icon: "layer" as const,
            onClick: onGroup,
          },
        ]
      : []),
    {
      id: "remove",
      text: "Delete filter",
      icon: "trash" as const,
      onClick: onRemove,
    },
  ];

  const committed = filterValue();

  /*
   * A date value is a Filter item with a calendar icon (ds-map, 21 Oct) that opens the DS datePicker composition,
   * relative dates and calendar together, as J3 · A3 draws it. The DS Filter's value can only be a text, number or
   * select input, so the row takes the value slot's press before the Filter's select sees it.
   */
  const opensDatePicker =
    type === "date" && row.operator !== "isIn" && !row.valueSource;
  const takeDateSlot = (
    event: React.PointerEvent | React.MouseEvent | React.KeyboardEvent,
  ) => {
    if (!opensDatePicker || !(event.target instanceof Element)) {
      return;
    }
    if (!event.target.closest('[data-part="input-slot"]')) {
      return;
    }
    if ("key" in event && !["Enter", " ", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "pointerdown") {
      open("value");
    }
  };

  return (
    <div
      className={cx(
        rowStackStyle,
        fullRowStackStyle,
        fullChipStyle,
      )}
    >
      {prefix}
      <div
        ref={rowRef}
        className={rowStyle}
        data-condition-row={row.id}
        onPointerEnter={showConditionOnHover}
        onPointerDownCapture={takeDateSlot}
        onClickCapture={takeDateSlot}
        onKeyDownCapture={takeDateSlot}
      >
        <Filter
          key={`${resetCount}:${row.propertyBaseUrl}:${row.valueSource ? "token" : "typed"}`}
          size="sm"
          className={filterFitStyle}
          property={`${row.id}:${row.propertyBaseUrl}`}
          propertyLabel={title}
          propertyMenu={[
            {
              id: "attributes",
              label: "Attributes",
              items: properties.map((candidate) => ({
                id: candidate.baseUrl,
                text: selectedLabel(
                  candidate.title,
                  candidate.baseUrl === row.propertyBaseUrl,
                ),
                selected: candidate.baseUrl === row.propertyBaseUrl,
                selectedStyle: "highlight" as const,
                onClick: () =>
                  onChange({
                    propertyBaseUrl: candidate.baseUrl,
                    operator:
                      operatorsFor(valueTypeOf(candidate.property), forGraph)
                        .items[0]?.value ?? null,
                    value: null,
                    values: undefined,
                    relative: undefined,
                    valueSource: undefined,
                  }),
              })),
            },
          ]}
          operators={filterOperators}
          value={row.operator ? { key: row.operator, value: committed } : null}
          removeable={false}
          onChange={(operatorKey, value) => apply(operatorKey, value)}
          onInput={(operatorKey, value) => {
            // Text is stored as it is typed ("@" opens the variable picker); other values when committed.
            if (
              type === "text" ||
              operatorKey !== row.operator ||
              value === VARIABLE ||
              value === TYPED ||
              value === SHOW_STEP
            ) {
              apply(operatorKey, value);
            }
          }}
        />
        <Menu
          position="bottom-end"
          items={rowMenu}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className={menuSegmentStyle}
              iconName="ellipsisVertical"
              aria-label="Condition options"
            />
          }
        />

        {openPart === "value" && type === "date" && row.operator !== "isIn" ? (
          <DatePopover
            triggerRef={valueSlotRef}
            alignToPanel
            onClose={close}
            label="Choose date"
            iso={row.relative || row.value === null ? null : String(row.value)}
            relative={row.relative}
            customOpen={ui.openField?.mode === "custom"}
            onPickDate={(iso) => {
              onChange({
                value: iso,
                relative: undefined,
                valueSource: undefined,
              });
              close();
            }}
            onPickRelative={(relative) => {
              onChange({ relative, value: null, valueSource: undefined });
              if (relative.kind !== "daysAgo" && relative.kind !== "interval") {
                close();
              }
            }}
            footer={
              allowVariables ? (
                <button
                  type="button"
                  className={relativeRowStyle}
                  onClick={() => open("variable")}
                >
                  <VariableIcon size={14} />
                  <span className={css({ flex: "1" })}>Use a variable</span>
                  <Icon name="chevronRight" size="xs" />
                </button>
              ) : null
            }
          />
        ) : null}

        {openPart === "variable" || openPart === "footer" ? (
          <SourceMenu
            anchor={mention !== undefined ? textRef : valueSlotRef}
            position="bottom-end"
            alignToPanel
            searchAlways={mention === undefined}
            stepId={step.stepId}
            input={valueInput}
            entry={entry}
            query={mention}
            focusRef={mention === undefined ? undefined : textRef}
            onClose={close}
            onPick={(source) => {
              onChange({
                valueSource: source,
                value: null,
                relative: undefined,
              });
              close();
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The builder
 * ------------------------------------------------------------------------------------------------------------- */

/** The builder (Figma Q8): rows 8 px apart, then the footer 16 px below, flush with the panel text. */
const builderStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "4",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
});

/** The rows (and the groups among them): 10 px apart, a little more air than Figma Q8 (Ciarán, 26 Oct). */
const rowsStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2.5",
  alignSelf: "stretch",
});

/** A group (Figma Q8): a grey box beside its joiner, with a caption, its own rows, "Add filter" and "Delete group". */
const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
  flex: "1",
  minWidth: "[0]",
  // 12 px on every side, 8 between the header and the rows (Figma, 3 Nov).
  padding: "3",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bgSolid.surface.active",
});

/** The group's header: "Any of the following are true…", 28 px tall over a hairline (Figma Group header). */
const groupCaptionStyle = css({
  display: "flex",
  alignItems: "center",
  alignSelf: "stretch",
  height: "[28px]",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

/** A footer: "Add filter" left, a text button right. */
const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  alignSelf: "stretch",
});

/** The builder's own footer: Add filter in the value column, under the chips (the line's 8 px gap after the label column). */
const valueColumnFooterStyle = css({
  paddingLeft: "[calc(var(--flows-label-column) + 8px)]",
});

/**
 * A row's joiner. "Where" on the first row stays plain text. Then AND / OR is a small chip with a menu, so it reads as
 * part of one long filter, not as an input label (26 Oct sync: Ciarán, Dora; uppercase, the team's own logic words).
 * A group is all-and or all-or, so a pick switches the joiner of every row in the group.
 */
/** "Where" reads as one of the panel's field labels: same 13 px, regular weight, muted colour (Aakarsh, 9 Nov). */
const whereStyle = css({
  color: "neutral.fg.muted",
  fontSize: "[13px]",
  lineHeight: "[16px]",
  fontWeight: "normal",
});

/** The AND / OR menu is 208 px wide in Figma (J2.10). */
const joinerMenuStyle = css({
  "&[class]": { width: "[208px]", minWidth: "[208px]" },
});

/** `?joiner=j1`: the joiner as a field label, plain muted text; its chevron shows on hover. */
const joinerTextStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[28px]",
  padding: "[0]",
  border: "none",
  background: "[none]",
  cursor: "pointer",
  color: "neutral.fg.muted",
  fontSize: "[13px]",
  lineHeight: "[16px]",
  fontWeight: "normal",
  "& > svg": { visibility: "hidden" },
  "&:hover > svg, &:focus-visible > svg, &[aria-expanded=true] > svg": {
    visibility: "visible",
  },
  _hover: { color: "neutral.fg.body" },
});

/** `?joiner=j2`: the DS xs ghost Button, lowercase and muted, its text level with "Where" (the xs padding pulled back). */
const joinerXsStyle = css({
  "&[class]": {
    marginLeft: "[-9px]",
    color: "neutral.fg.muted",
    fontSize: "[13px]",
    fontWeight: "normal",
  },
});

const joinerItems = (
  conjunction: "and" | "or" | undefined,
  onPick: (conjunction: "and" | "or") => void,
  label: (choice: "and" | "or") => string,
) =>
  (["and", "or"] as const).map((choice) => ({
    id: choice,
    text: selectedLabel(label(choice), (conjunction ?? "and") === choice),
    selected: (conjunction ?? "and") === choice,
    selectedStyle: "highlight" as const,
    onClick: () => onPick(choice),
  }));

export const Joiner = ({
  conjunction,
  onPick,
}: {
  conjunction?: "and" | "or" | undefined;
  onPick?: (conjunction: "and" | "or") => void;
}) => (
  <span className={joinerColumnStyle} data-joiner={conjunction ?? "where"}>
    {onPick ? (
      <Menu
        className={joinerMenuStyle}
        items={joinerItems(conjunction, onPick, (choice) => choice)}
        trigger={
          joinerTake === "j1" || !joinerTake ? (
            <button
              type="button"
              className={cx(joinerTextStyle, fullJoinerStyle)}
              aria-label={`Join with ${conjunction ?? "and"}`}
            >
              {conjunction ?? "and"}
              <Icon name="chevronDown" size="xs" />
            </button>
          ) : joinerTake === "j2" ? (
            <Button
              size="xs"
              variant="ghost"
              className={joinerXsStyle}
              iconName="chevronDown"
              iconPosition="right"
              aria-label={`Join with ${conjunction ?? "and"}`}
            >
              {conjunction ?? "and"}
            </Button>
          ) : (
            // Figma's Joiner: the DS Button, outline, neutral, sm (28 px), label then chevron. Code Button's outline is
            // `subtle`, as for Add filter.
            <Button
              size="sm"
              variant="subtle"
              iconName="chevronDown"
              iconPosition="right"
              aria-label={`Join with ${conjunction ?? "and"}`}
            >
              {(conjunction ?? "and").toUpperCase()}
            </Button>
          )
        }
      />
    ) : (
      <span className={whereStyle} data-field-label="">
        Where
      </span>
    )}
  </span>
);

/** `?joiner=j3`: a row with no joiner keeps the column empty, so its chip stays level with the others. */
export const EmptyJoiner = () => (
  <span className={joinerColumnStyle} data-joiner="none" />
);

const matchLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minHeight: "[28px]",
  color: "neutral.fg.muted",
  fontSize: "[13px]",
  lineHeight: "[16px]",
  "& button": {
    display: "inline-flex",
    alignItems: "center",
    gap: "1",
    padding: "[0]",
    border: "none",
    background: "[none]",
    cursor: "pointer",
    color: "neutral.fg.body",
    fontSize: "[13px]",
    fontWeight: "medium",
  },
});

/** `?joiner=j3`: "Where all of these match ⌄" once, above two or more rows. */
export const MatchLine = ({
  conjunction,
  onPick,
}: {
  conjunction: "and" | "or" | undefined;
  onPick: (conjunction: "and" | "or") => void;
}) => (
  <span className={matchLineStyle} data-joiner-line="">
    Where
    <Menu
      className={joinerMenuStyle}
      items={joinerItems(conjunction, onPick, (choice) =>
        choice === "and" ? "all of these match" : "any of these match",
      )}
      trigger={
        <button type="button" aria-label="How the conditions combine">
          {(conjunction ?? "and") === "and" ? "all" : "any"}
          <Icon name="chevronDown" size="xs" />
        </button>
      }
    />
    of these match
  </span>
);

/** "Add filter": a DS subtle Button (code Button has no outline variant; Figma draws outline) that opens the attributes as a DS Menu (J3 A1). */
const AddCondition = ({
  properties,
  onAdd,
  label,
}: {
  properties: BuilderProperty[];
  onAdd: (property: BuilderProperty) => void;
  label: string;
}) => (
  <Menu
    items={[
      {
        id: "attributes",
        label: "Attributes",
        items: properties.map((property) => ({
          id: property.baseUrl,
          text: property.title,
          onClick: () => onAdd(property),
        })),
      },
    ]}
    trigger={
      <Button size="sm" variant="subtle" iconName="plus">
        {label}
      </Button>
    }
  />
);

export const ConditionBuilder = ({
  step,
  input,
  entry,
  draft,
  properties,
  forGraph,
  update,
  allowVariables = true,
  startWithRow = false,
}: {
  step: DraftActionStep;
  input: InputView;
  entry: CatalogEntry;
  draft: QueryDraft;
  properties: BuilderProperty[];
  forGraph: boolean;
  update: (next: QueryDraft) => void;
  /** False for a trigger's condition: nothing runs before it, so there is nothing to refer to. */
  allowVariables?: boolean;
  /** An empty builder shows one empty "Where" row instead of only "Add filter" (If, Filter list; Figma Q12). */
  startWithRow?: boolean;
}) => {
  const { setUi } = useEditor();
  const groups = draft.groups ?? [];
  const allIds = [
    ...draft.conditions,
    ...groups.flatMap((group) => group.conditions),
  ].map((row) => row.id);
  const nextId = Math.max(0, ...allIds, ...groups.map((group) => group.id)) + 1;
  const newRow = (property?: BuilderProperty): ConditionRow => ({
    id: nextId,
    propertyBaseUrl: property?.baseUrl ?? "",
    operator: property
      ? (operatorsFor(valueTypeOf(property.property), forGraph).items[0]
          ?.value ?? null)
      : null,
    value: null,
  });
  const setRows = (conditions: ConditionRow[]) =>
    update({ ...draft, conditions });
  const setGroup = (id: number, change: Partial<QueryGroup>) =>
    update({
      ...draft,
      groups: groups
        .map((group) => (group.id === id ? { ...group, ...change } : group))
        .filter((group) => group.conditions.length > 0),
    });
  const setConjunction = (conjunction: "and" | "or") =>
    update({ ...draft, conjunction });

  // The empty "Where" row is not stored until the user sets something on it.
  const emptyRow =
    startWithRow &&
    draft.conditions.length + groups.length === 0 &&
    properties.length > 0
      ? newRow()
      : null;
  const topRows = emptyRow ? [emptyRow] : draft.conditions;

  if (properties.length === 0) {
    // J2.2: with the type left at Any there is nothing to filter on yet; Add filter first asks for a type.
    return (
      <div
        className={cx(
          labelColumnStyle,
          oldLabelColumn && oldLabelColumnWidthStyle,
        )}
      >
        <div className={valueColumnFooterStyle}>
          <Button
            size="sm"
            variant="subtle"
            iconName="plus"
            onClick={() =>
              setUi((current) => ({
                ...current,
                openField: {
                  stepId: step.stepId,
                  inputName: "entityType",
                  mode: "menu",
                },
              }))
            }
          >
            Add filter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        builderStyle,
        labelColumnStyle,
        oldLabelColumn && oldLabelColumnWidthStyle,
        conditionLayout === "c" && takeColumnStyle,
      )}
      data-condition-builder
    >
      {topRows.length + groups.length > 0 ? (
        <div className={cx(rowsStyle, conditionLayout && takeRowsStyle)}>
          {joinerTake === "j3" && topRows.length > 1 ? (
            <MatchLine
              conjunction={draft.conjunction}
              onPick={setConjunction}
            />
          ) : null}
          {topRows.map((row, index) => (
            <ConditionRowView
              key={row.id}
              step={step}
              input={input}
              entry={entry}
              row={row}
              properties={properties}
              forGraph={forGraph}
              prefix={
                joinerTake === "j3" && topRows.length > 1 ? (
                  <EmptyJoiner />
                ) : (
                  <Joiner
                    conjunction={index === 0 ? undefined : draft.conjunction}
                    onPick={index === 0 ? undefined : setConjunction}
                  />
                )
              }
              onChange={(change) =>
                setRows(
                  emptyRow
                    ? [{ ...row, ...change }]
                    : draft.conditions.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, ...change }
                          : candidate,
                      ),
                )
              }
              onRemove={() =>
                setRows(
                  draft.conditions.filter(
                    (candidate) => candidate.id !== row.id,
                  ),
                )
              }
              allowVariables={allowVariables}
              onGroup={() =>
                update({
                  ...draft,
                  conditions: draft.conditions.filter(
                    (candidate) => candidate.id !== row.id,
                  ),
                  groups: [
                    ...groups,
                    { id: nextId, conjunction: "or", conditions: [row] },
                  ],
                })
              }
            />
          ))}
          {groups.map((group, groupIndex) => {
            const first = topRows.length === 0 && groupIndex === 0;
            return (
              // 2 Nov: a group sits on its own line under its joiner and takes the panel's full width.
              <div
                key={group.id}
                className={css({
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "1",
                  alignSelf: "stretch",
                  "& > [data-condition-group]": { alignSelf: "stretch" },
                })}
              >
                <Joiner
                  conjunction={first ? undefined : draft.conjunction}
                  onPick={first ? undefined : setConjunction}
                />
                <div className={groupStyle} data-condition-group={group.id}>
                  <span className={groupCaptionStyle}>
                    {group.conjunction === "or"
                      ? "Any of the following are true…"
                      : "All of the following are true…"}
                  </span>
                  {group.conditions.map((row, index) => (
                    <ConditionRowView
                      key={row.id}
                      step={step}
                      input={input}
                      entry={entry}
                      row={row}
                      properties={properties}
                      forGraph={forGraph}
                      prefix={
                        <Joiner
                          conjunction={
                            index === 0 ? undefined : group.conjunction
                          }
                          onPick={
                            index === 0
                              ? undefined
                              : (conjunction) =>
                                  setGroup(group.id, { conjunction })
                          }
                        />
                      }
                      onChange={(change) =>
                        setGroup(group.id, {
                          conditions: group.conditions.map((candidate) =>
                            candidate.id === row.id
                              ? { ...candidate, ...change }
                              : candidate,
                          ),
                        })
                      }
                      allowVariables={allowVariables}
                      onRemove={() =>
                        setGroup(group.id, {
                          conditions: group.conditions.filter(
                            (candidate) => candidate.id !== row.id,
                          ),
                        })
                      }
                    />
                  ))}
                  <div className={footerStyle}>
                    <AddCondition
                      label="Add filter"
                      properties={properties}
                      onAdd={(property) =>
                        setGroup(group.id, {
                          conditions: [...group.conditions, newRow(property)],
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        update({
                          ...draft,
                          groups: groups.filter(
                            (candidate) => candidate.id !== group.id,
                          ),
                        })
                      }
                    >
                      Delete group
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div
        className={footerStyle}
      >
        <AddCondition
          label="Add filter"
          properties={properties}
          onAdd={(property) =>
            setRows([...(emptyRow ? [] : draft.conditions), newRow(property)])
          }
        />
        {/* 2 Nov frames (J2.4–J2.8) end the builder with Add filter alone; rows go one by one from their ⋮. */}
      </div>
    </div>
  );
};

export { VALUE_SUBJECT };
