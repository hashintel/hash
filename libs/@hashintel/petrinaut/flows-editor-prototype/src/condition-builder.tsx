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
import { useEffect, useRef, useState } from "react";

import {
  Button,
  Filter,
  type FilterOperator,
  Icon,
  type IconName,
  Menu,
  type MenuItem,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { HashIcon } from "@hashintel/ds-icons";

import {
  type CatalogEntry,
  getCatalogEntry,
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
import { SourceMenu } from "./source-menu";

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
        ? (getCatalogEntry(step.actionDefinitionId)?.outputs ?? [])
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

const tokenIcon = (
  document: EditorDocument,
  source: StepInputSource,
): IconName => {
  if (source.kind === "flow-input") {
    // A flow input lives on Start: Start's icon, as J3 · B2 draws the token.
    return "play";
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    return (
      (step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)?.icon
        : undefined) ?? "rotate"
    );
  }
  return "rotate";
};

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
const rowStackStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  alignSelf: "stretch",
  minWidth: "[0]",
});

/** The joiner column: 64 px on every row, so the chips share one left edge. */
const joinerColumnStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  width: "[64px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

/** A row: the chip, then its ⋮ segment, on one line. */
const rowStyle = css({
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
const filterFitStyle = css({
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
  "&[class] > :last-child": {
    borderStartEndRadius: "[0]",
    borderEndEndRadius: "[0]",
  },
});

/** The ⋮ as the chip's last segment: the chip's hairline on three sides, its divider on the left. */
const menuSegmentStyle = css({
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
              <Icon name={tokenIcon(document, row.valueSource!)} size="xs" />
              <TokenLabel parts={tokenParts} />
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
            icon: "pencil" as const,
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
    <div className={rowStackStyle}>
      {prefix}
      <div
        ref={rowRef}
        className={rowStyle}
        data-condition-row={row.id}
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
                text: candidate.title,
                selected: candidate.baseUrl === row.propertyBaseUrl,
                selectedStyle: "tick" as const,
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

/** The rows (and the groups among them): 8 px apart. */
const rowsStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
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
  padding: "2",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bgSolid.surface.active",
});

/** The group's caption: "Any of the following are true…". */
const groupCaptionStyle = css({
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

/**
 * A row's joiner (Figma Q8): "Where" on the first row, then a small "and ▾" / "or ▾" menu. A group is all-and or
 * all-or, so a pick switches the joiner of every row in the group.
 */
const Joiner = ({
  conjunction,
  onPick,
}: {
  conjunction?: "and" | "or" | undefined;
  onPick?: (conjunction: "and" | "or") => void;
}) => (
  <span className={joinerColumnStyle} data-joiner={conjunction ?? "where"}>
    {onPick ? (
      <Menu
        items={(["and", "or"] as const).map((choice) => ({
          id: choice,
          text: choice,
          selected: (conjunction ?? "and") === choice,
          selectedStyle: "tick" as const,
          onClick: () => onPick(choice),
        }))}
        trigger={
          <Button
            size="sm"
            variant="subtle"
            iconName="chevronDown"
            iconPosition="right"
            aria-label={`Join with ${conjunction ?? "and"}`}
          >
            {conjunction ?? "and"}
          </Button>
        }
      />
    ) : (
      "Where"
    )}
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

/** "Use a variable": the same picker as "@", for the field it sits under. A DS ghost Button with the [x] glyph. */
export const UseVariable = ({
  onClick,
  open,
}: {
  onClick: () => void;
  /** Pressed while its picker is open. */
  open?: boolean;
}) => (
  <Button size="xs" variant="ghost" pressed={open} onClick={onClick}>
    <VariableRow />
  </Button>
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
  const allRows = [...topRows, ...groups.flatMap((group) => group.conditions)];
  // Nothing to clear: no rows, or one row with nothing set.
  const clearable =
    allRows.length > 1 || allRows.some((row) => row.propertyBaseUrl);

  if (properties.length === 0) {
    return (
      <>
        <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
          All of this type
        </span>
        <div>
          <Button
            size="sm"
            variant="subtle"
            iconName="plus"
            disabled
            tooltip="Choose an entity type first"
          >
            Add condition
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className={builderStyle} data-condition-builder>
      {topRows.length + groups.length > 0 ? (
        <div className={rowsStyle}>
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
                <Joiner
                  conjunction={index === 0 ? undefined : draft.conjunction}
                  onPick={index === 0 ? undefined : setConjunction}
                />
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
              <div
                key={group.id}
                className={css({
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1",
                  alignSelf: "stretch",
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
      <div className={footerStyle}>
        <AddCondition
          label="Add filter"
          properties={properties}
          onAdd={(property) =>
            setRows([...(emptyRow ? [] : draft.conditions), newRow(property)])
          }
        />
        {clearable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update({ ...draft, conditions: [], groups: [] })}
          >
            Clear all filters
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export { VALUE_SUBJECT };
