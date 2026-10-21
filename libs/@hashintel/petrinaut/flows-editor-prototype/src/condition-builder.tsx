/**
 * The condition builder of Find entities, If and Filter list, as rebuilt on Figma J3 (section 470:3681): rows of
 * pills ("Where", then "And" / "Or"), grey groups with their own "Add filter", operators that follow the attribute's
 * type, and a typed value editor per type (dates, statuses, entities, numbers, text). Any value can instead be a
 * variable, picked from the same menu as "@".
 *
 * MOCK, editor side only: relative dates ("Today", "3 days ago") and "is in month". The engine's condition values are
 * fixed (Attio teardown, 21 Oct); these are marked in their hover.
 */
import { Fragment, useRef, useState } from "react";

import {
  Icon,
  type IconName,
  NumberInput,
  Popover,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { HashIcon } from "@hashintel/ds-icons";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import { type CatalogEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  DatePickerSurface,
  formatDate,
  months,
  relativeLabel,
  relativeRowStyle,
  today,
} from "./date-picker";
import {
  type ConditionOperator,
  type ConditionRow,
  type DraftActionStep,
  type EditorDocument,
  findStep,
  type QueryDraft,
  type QueryGroup,
  stepTitle,
  VALUE_SUBJECT,
} from "./document";
import { useEditor } from "./editor-context";
import {
  findPropertyType,
  type MockPropertyType,
  mockEntities,
  mockEntityTypes,
} from "./mock-graph";
import { triggerForInput } from "./shapes";
import {
  menuGroupLabelStyle,
  menuGroupStyle,
  menuPanelStyle,
  menuRowStyle,
  SourceMenu,
} from "./source-menu";

import type { StepInputSource } from "./engine";

/* ----------------------------------------------------------------------------------------------------------------
 * Pills
 * ------------------------------------------------------------------------------------------------------------- */

/** One pill of a condition row: 24 px, a hairline, 6 px corners, 12 px medium text, a 12 px icon. */
const pillStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[24px]",
  maxWidth: "[100%]",
  paddingX: "1.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "xs",
  // The DS xs style tracks text out a little; pills read tighter, as drawn.
  letterSpacing: "normal",
  fontWeight: "medium",
  color: "neutral.fg.body",
  whiteSpace: "nowrap",
  cursor: "pointer",
  "& > span": { paddingX: "0.5", overflow: "hidden", textOverflow: "ellipsis" },
  "&[class] svg": {
    width: "[12px]",
    height: "[12px]",
    "--icon-size": "12px",
    flexShrink: 0,
  },
  _hover: {
    borderColor: "neutral.bd.solid.hover",
    backgroundColor: "neutral.bgSolid.min.hover",
  },
  "&[data-open]": { borderColor: "neutral.bd.strong" },
  "&[data-placeholder] > span": { color: "neutral.fg.subtle" },
  _focusVisible: { outline: "[2px solid var(--colors-blue-bd-strong)]" },
});

/** The DS tooltip trigger is a line-height 0 span; in a row it must size to its pill. */
const tipStyle = css({
  "&[class]": { display: "inline-flex", maxWidth: "[100%]", minWidth: "[0]" },
});

/** "Where": the first row's prefix, plain muted text. */
const wherePrefixStyle = css({
  display: "inline-flex",
  alignItems: "center",
  height: "[24px]",
  paddingX: "1.5",
  textStyle: "xs",
  letterSpacing: "normal",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
});

/** A ghost button of the builder ("Add filter", "Use a variable", the row ⋮): 24 px, 12 px text, no border. */
const ghostStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[24px]",
  paddingX: "1.5",
  borderRadius: "md",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  cursor: "pointer",
  "& > span": { paddingX: "0.5" },
  "&[class] svg": { width: "[12px]", height: "[12px]", "--icon-size": "12px" },
  _hover: {
    backgroundColor: "neutral.bg.surface.active",
    color: "neutral.fg.body",
  },
  // Pressed while its picker is open (J3 B1).
  "&[data-open]": {
    boxShadow: "[inset 0 0 0 1px var(--colors-neutral-bd-solid)]",
    color: "neutral.fg.body",
  },
  _focusVisible: { outline: "[2px solid var(--colors-blue-bd-strong)]" },
});

const rowMenuStyle = css({
  "&[class]": {
    width: "[24px]",
    paddingX: "[0]",
    justifyContent: "center",
    marginLeft: "auto",
  },
});

/** The builder: a hairline box, 8 px in, rows 6 px apart. */
const builderStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  padding: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
});

/** A group: a grey box inside the builder with its own rows and "Add filter". */
const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1.5",
  padding: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.surface.active",
});

/** A row: its pills wrap if they must; the ⋮ stays on the first line, at the end. */
const rowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "1",
  width: "[100%]",
});

const pillsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flex: "1",
  minWidth: "[0]",
  // Pills keep their size and wrap to a second line in the 384 px panel; only a value longer than the whole row
  // ends in an ellipsis. The row's ⋮ stays on the first line.
  flexWrap: "wrap",
  "& > *": { flexShrink: 0, maxWidth: "[100%]" },
});

export const Pill = ({
  icon,
  label,
  trailing = "chevronDown",
  placeholder,
  open,
  onClick,
  ariaLabel,
  pillRef,
  tone,
}: {
  icon?: IconName;
  label: React.ReactNode;
  trailing?: IconName | null;
  placeholder?: boolean;
  open?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  pillRef?: React.Ref<HTMLButtonElement>;
  /** A variable token: the icon takes the source step's colour. */
  tone?: "green" | "orange" | "blue" | "neutral";
}) => (
  <button
    ref={pillRef}
    type="button"
    className={pillStyle}
    data-open={open || undefined}
    data-placeholder={placeholder || undefined}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {icon ? (
      <span
        className={css({
          display: "inline-flex",
          paddingX: "[0]",
          color: tone ? `${tone}.fg.muted` : "neutral.fg.muted",
        })}
      >
        <Icon name={icon} size="xs" />
      </span>
    ) : null}
    <span>{label}</span>
    {trailing ? <Icon name={trailing} size="xs" /> : null}
  </button>
);

/* ----------------------------------------------------------------------------------------------------------------
 * Operators by type
 * ------------------------------------------------------------------------------------------------------------- */

type ValueType = "date" | "number" | "options" | "entity" | "boolean" | "text";

export const valueTypeOf = (
  property:
    | Pick<MockPropertyType, "payloadKind" | "options" | "linksTo">
    | undefined,
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

/* ----------------------------------------------------------------------------------------------------------------
 * The popover menu every pill opens (DS Menu look; controlled, so a screen state can show it open)
 * ------------------------------------------------------------------------------------------------------------- */

const MenuRows = ({
  label,
  items,
}: {
  label?: string;
  items: {
    key: string;
    text: string;
    icon?: IconName;
    selected?: boolean;
    hint?: string;
    onPick: () => void;
    trailing?: IconName;
    /** "Use a variable": the variable glyph instead of a DS icon. */
    variable?: boolean;
  }[];
}) => (
  <div className={menuGroupStyle}>
    {label ? <div className={menuGroupLabelStyle}>{label}</div> : null}
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        className={menuRowStyle}
        data-selected={item.selected || undefined}
        title={item.hint}
        onClick={item.onPick}
      >
        {item.selected ? (
          <Icon name="check" size="xs" />
        ) : item.variable ? (
          <VariableIcon size={14} />
        ) : item.icon ? (
          <Icon name={item.icon} size="xs" />
        ) : null}
        <span
          className={css({
            flex: "1",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        >
          {item.text}
        </span>
        {item.trailing ? <Icon name={item.trailing} size="sm" /> : null}
      </button>
    ))}
  </div>
);

/* ----------------------------------------------------------------------------------------------------------------
 * One condition row
 * ------------------------------------------------------------------------------------------------------------- */

export type BuilderProperty = {
  baseUrl: string;
  title: string;
  property?: MockPropertyType;
};

/** A variable's path, step name first: "Find entities › Shipments this month › Shipment", or "Start › Review month". */
export const tokenPath = (
  document: EditorDocument,
  source: StepInputSource,
): string[] => {
  if (source.kind === "flow-input") {
    const input = document.inputs.find(
      (candidate) => candidate.name === source.inputName,
    );
    return ["Start", input?.label ?? source.inputName];
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    if (!step) {
      return [source.stepId];
    }
    const output =
      step.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)?.outputs.find(
            (candidate) => candidate.name === source.outputName,
          )
        : undefined;
    const title = stepTitle(step);
    const description =
      step.description && step.description !== title ? [step.description] : [];
    return [title, ...description, output?.label ?? source.outputName];
  }
  if (source.kind === "item") {
    return ["For each", "Current item"];
  }
  return [String(source.payload.value)];
};

/** Long paths collapse their middle to "…" (Attio); the hover shows the whole path. */
export const collapsePath = (parts: string[]) =>
  parts.length > 2
    ? [parts[0], "…", parts.at(-1)].join(" › ")
    : parts.join(" › ");

const tokenLook = (
  document: EditorDocument,
  source: StepInputSource,
): { icon: IconName; tone: "green" | "orange" | "blue" | "neutral" } => {
  if (source.kind === "flow-input") {
    const trigger = triggerForInput(document, source.inputName);
    return { icon: trigger?.definition.icon ?? "play", tone: "green" };
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    const entry =
      step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)
        : undefined;
    return { icon: entry?.icon ?? "rotate", tone: entry?.tone ?? "green" };
  }
  return { icon: "rotate", tone: "green" };
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
    part: "attribute" | "operator" | "value" | "variable" | "menu" | null,
    mode: "menu" | "mention" = "menu",
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
  const [search, setSearch] = useState("");

  const attributeRef = useRef<HTMLButtonElement>(null);
  const operatorRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  const subject = properties.find(
    (candidate) => candidate.baseUrl === row.propertyBaseUrl,
  );
  const property = subject?.property ?? findPropertyType(row.propertyBaseUrl);
  const type = valueTypeOf(property);
  const operators = operatorsFor(type, forGraph);
  const operator = operators.items.find(
    (candidate) => candidate.value === row.operator,
  );
  const valueKind = property?.payloadKind ?? "Text";
  const listOperator = row.operator === "isAnyOf";
  const valueInput: InputView = {
    name: key,
    label: subject?.title ?? "Value",
    array: listOperator,
    required: true,
    hasDefault: false,
    kinds: [valueKind],
  };
  const picked = row.values ?? [];
  const linked = mockEntities.filter(
    (entity) =>
      !property?.linksTo || entity.entityTypeBaseUrl === property.linksTo,
  );
  const linkedType = mockEntityTypes.find(
    (candidate) => candidate.baseUrl === property?.linksTo,
  );

  // The variable picker anchors to the value pill, or (number and text values) to the row.
  const valueAnchor =
    row.valueSource || ["date", "options", "boolean", "entity"].includes(type)
      ? valueRef
      : rowRef;

  const close = () => {
    setMention(undefined);
    setSearch("");
    open(null);
  };

  /** The last row of a value picker: variables live in the value slot (21 Oct), not in a builder footer. */
  const variableRow = allowVariables ? (
    <MenuRows
      items={[
        {
          key: "variable",
          text: "Use a variable",
          variable: true,
          onPick: () => open("variable"),
        },
      ]}
    />
  ) : null;

  /* The value pill, by type. */
  let valuePill: React.ReactNode = null;
  if (operator?.takesValue === false) {
    valuePill = null;
  } else if (row.valueSource) {
    const parts = tokenPath(document, row.valueSource);
    const look = tokenLook(document, row.valueSource);
    const source = row.valueSource;
    valuePill = (
      <Tooltip content={parts.join(" › ")} className={tipStyle}>
        <Pill
          pillRef={valueRef}
          icon={look.icon}
          tone={look.tone}
          label={collapsePath(parts)}
          trailing={null}
          ariaLabel={`Change the source of ${valueInput.label}`}
          onClick={() =>
            source.kind === "step-output"
              ? setUi((current) => ({
                  ...current,
                  selectedId: source.stepId,
                  openField: null,
                }))
              : open("variable")
          }
        />
      </Tooltip>
    );
  } else if (type === "date") {
    const label =
      row.operator === "isIn"
        ? (recentMonths.find((month) => month.value === row.value)?.text ??
          (row.value === null ? null : String(row.value)))
        : row.relative
          ? relativeLabel(row.relative)
          : row.value
            ? formatDate(String(row.value))
            : null;
    valuePill = (
      <Pill
        pillRef={valueRef}
        icon="calendar"
        label={label ?? "Select date..."}
        placeholder={!label}
        open={openPart === "value"}
        ariaLabel={`${valueInput.label} value`}
        onClick={() => open("value")}
      />
    );
  } else if (type === "number") {
    valuePill = (
      <div className={css({ width: "[72px]" })}>
        <NumberInput
          size="xs"
          width="fullWidth"
          value={typeof row.value === "number" ? row.value : null}
          aria-label={`${valueInput.label} value`}
          onChange={(value) => onChange({ value: value ?? null })}
        />
      </div>
    );
  } else if (type === "options" || type === "boolean") {
    const label =
      type === "boolean"
        ? row.value === null
          ? null
          : String(row.value) === "true"
            ? "Yes"
            : "No"
        : row.value === null
          ? null
          : String(row.value);
    valuePill = (
      <Pill
        pillRef={valueRef}
        label={label ?? "Select…"}
        placeholder={!label}
        open={openPart === "value"}
        ariaLabel={`${valueInput.label} value`}
        onClick={() => open("value")}
      />
    );
  } else if (type === "entity") {
    const label =
      picked.length === 0
        ? null
        : picked.length === 1
          ? picked[0]
          : `${picked[0]} +${picked.length - 1}`;
    valuePill = (
      <Pill
        pillRef={valueRef}
        label={
          label ??
          `Select a ${(linkedType?.title ?? "record").toLowerCase()}...`
        }
        placeholder={!label}
        open={openPart === "value"}
        ariaLabel={`Choose ${valueInput.label} values`}
        onClick={() => open("value")}
      />
    );
  } else {
    // Text: typed in the pill; "@" opens the variable picker with the token shown in the field.
    valuePill = (
      <input
        ref={textRef}
        className={cx(
          pillStyle,
          css({
            width: "[140px]",
            cursor: "text",
            _placeholder: { color: "neutral.fg.subtle" },
          }),
        )}
        value={`${row.value === null ? "" : String(row.value)}${mention === undefined ? "" : `@${mention}`}`}
        placeholder={allowVariables ? "Value, or @" : "Value"}
        aria-label={`${valueInput.label} value`}
        onChange={(event) => {
          const next = event.target.value;
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
        }}
      />
    );
  }

  return (
    <div
      ref={rowRef}
      className={rowStyle}
      role="group"
      data-condition-row={row.id}
    >
      <div className={pillsStyle}>
        {prefix}
        <Pill
          pillRef={attributeRef}
          label={subject?.title ?? "Value"}
          open={openPart === "attribute"}
          ariaLabel="Attribute"
          onClick={() => open("attribute")}
        />
        <Pill
          pillRef={operatorRef}
          label={operator?.text ?? "…"}
          open={openPart === "operator"}
          ariaLabel="Operator"
          onClick={() => open("operator")}
        />
        {valuePill}
      </div>
      <button
        ref={menuRef}
        type="button"
        className={cx(ghostStyle, rowMenuStyle)}
        aria-label="Condition options"
        onClick={() => open("menu")}
      >
        <Icon name="ellipsisVertical" size="xs" />
      </button>

      {openPart === "attribute" ? (
        <Popover
          triggerRef={attributeRef}
          position="bottom-start"
          gapY={4}
          onClose={close}
        >
          <div
            className={menuPanelStyle}
            role="dialog"
            aria-label="Choose attribute"
          >
            <MenuRows
              label="Attributes"
              items={properties.map((candidate) => ({
                key: candidate.baseUrl,
                text: candidate.title,
                selected: candidate.baseUrl === row.propertyBaseUrl,
                onPick: () => {
                  onChange({
                    propertyBaseUrl: candidate.baseUrl,
                    operator:
                      operatorsFor(valueTypeOf(candidate.property), forGraph)
                        .items[0]?.value ?? null,
                    value: null,
                    values: undefined,
                    relative: undefined,
                    valueSource: undefined,
                  });
                  close();
                },
              }))}
            />
          </div>
        </Popover>
      ) : null}

      {openPart === "operator" ? (
        <Popover
          triggerRef={operatorRef}
          position="bottom-start"
          gapY={4}
          onClose={close}
        >
          <div
            className={menuPanelStyle}
            role="dialog"
            aria-label="Choose operator"
          >
            <MenuRows
              label={operators.label}
              items={operators.items.map((choice) => ({
                key: choice.value,
                text: choice.text,
                hint: choice.mock,
                selected: choice.value === row.operator,
                onPick: () => {
                  onChange({
                    operator: choice.value,
                    ...(choice.value === "isIn" || row.operator === "isIn"
                      ? { value: null, relative: undefined }
                      : {}),
                  });
                  close();
                },
              }))}
            />
          </div>
        </Popover>
      ) : null}

      {openPart === "value" ? (
        <Popover
          triggerRef={valueRef}
          position="bottom-start"
          gapY={4}
          onClose={close}
        >
          {type === "date" && row.operator === "isIn" ? (
            <div
              className={menuPanelStyle}
              role="dialog"
              aria-label="Choose month"
            >
              <OverlayScrollArea className={css({ maxHeight: "[320px]" })}>
                <MenuRows
                  label="Month (editor mock)"
                  items={recentMonths.map((month) => ({
                    key: month.value,
                    text: month.text,
                    icon: "calendar" as const,
                    selected: row.value === month.value,
                    onPick: () => {
                      onChange({ value: month.value, relative: undefined });
                      close();
                    },
                  }))}
                />
              </OverlayScrollArea>
            </div>
          ) : type === "date" ? (
            <DatePickerSurface
              label="Choose date"
              iso={
                row.relative || row.value === null ? null : String(row.value)
              }
              relative={row.relative}
              onPickDate={(iso) => {
                onChange({ value: iso, relative: undefined });
                close();
              }}
              onPickRelative={(relative) => {
                onChange({ relative, value: null });
                if (relative.kind !== "daysAgo") {
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
                    Use a variable
                  </button>
                ) : null
              }
            />
          ) : type === "options" || type === "boolean" ? (
            <div
              className={menuPanelStyle}
              role="dialog"
              aria-label={`Choose ${valueInput.label}`}
            >
              <MenuRows
                label={type === "boolean" ? valueInput.label : valueInput.label}
                items={(type === "boolean"
                  ? ["true", "false"]
                  : (property?.options ?? [])
                ).map((option) => ({
                  key: option,
                  text:
                    type === "boolean"
                      ? option === "true"
                        ? "Yes"
                        : "No"
                      : option,
                  selected: row.value !== null && String(row.value) === option,
                  onPick: () => {
                    onChange({ value: option });
                    close();
                  },
                }))}
              />
              {variableRow}
            </div>
          ) : type === "entity" ? (
            <div
              className={menuPanelStyle}
              role="dialog"
              aria-label={`Choose ${valueInput.label}`}
            >
              <div className={css({ padding: "1", paddingBottom: "0" })}>
                <TextInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search"
                  size="sm"
                  prefix={{ iconName: "search", variant: "subtle" }}
                />
              </div>
              <OverlayScrollArea className={css({ maxHeight: "[320px]" })}>
                <MenuRows
                  label={linkedType?.pluralTitle ?? "Entities"}
                  items={linked
                    .filter((entity) =>
                      entity.label
                        .toLowerCase()
                        .includes(search.trim().toLowerCase()),
                    )
                    .map((entity) => ({
                      key: entity.entityId,
                      text: entity.label,
                      icon: "cube" as const,
                      selected: picked.includes(entity.label),
                      onPick: () => {
                        if (listOperator) {
                          onChange({
                            values: picked.includes(entity.label)
                              ? picked.filter((value) => value !== entity.label)
                              : [...picked, entity.label],
                          });
                          return;
                        }
                        onChange({
                          values: [entity.label],
                          value: entity.entityId,
                        });
                        close();
                      },
                    }))}
                />
              </OverlayScrollArea>
              {variableRow}
            </div>
          ) : null}
        </Popover>
      ) : null}

      {openPart === "menu" ? (
        <Popover
          triggerRef={menuRef}
          position="bottom-end"
          gapY={4}
          onClose={close}
        >
          <div
            className={menuPanelStyle}
            role="dialog"
            aria-label="Condition options"
          >
            <MenuRows
              items={[
                ...(allowVariables
                  ? [
                      {
                        key: "variable",
                        text: "Use a variable",
                        variable: true,
                        onPick: () => open("variable"),
                      },
                    ]
                  : []),
                ...(row.valueSource
                  ? [
                      {
                        key: "typed",
                        text: "Type a value instead",
                        icon: "pencil" as const,
                        onPick: () => {
                          onChange({ valueSource: undefined });
                          close();
                        },
                      },
                    ]
                  : []),
                ...(onGroup
                  ? [
                      {
                        key: "group",
                        text: "Turn into a group",
                        icon: "layer" as const,
                        onPick: () => {
                          onGroup();
                          close();
                        },
                      },
                    ]
                  : []),
                {
                  key: "remove",
                  text: "Delete condition",
                  icon: "trash" as const,
                  onPick: () => {
                    onRemove();
                    close();
                  },
                },
              ]}
            />
          </div>
        </Popover>
      ) : null}

      {openPart === "variable" || openPart === "footer" ? (
        <SourceMenu
          anchor={mention !== undefined ? textRef : valueAnchor}
          searchAlways={mention === undefined}
          stepId={step.stepId}
          input={valueInput}
          entry={entry}
          query={mention}
          focusRef={mention === undefined ? undefined : textRef}
          onClose={close}
          onPick={(source) => {
            onChange({ valueSource: source, value: null, relative: undefined });
            close();
          }}
          onTypeValue={() => {
            onChange({ valueSource: undefined });
            close();
          }}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The builder
 * ------------------------------------------------------------------------------------------------------------- */

const conjunctionLabel = (conjunction: "and" | "or" | undefined) =>
  conjunction === "or" ? "Or" : "And";

const Prefix = ({
  index,
  conjunction,
  onToggle,
}: {
  index: number;
  conjunction: "and" | "or" | undefined;
  onToggle: () => void;
}) =>
  index === 0 ? (
    <span className={wherePrefixStyle}>Where</span>
  ) : (
    <Pill
      label={conjunctionLabel(conjunction)}
      trailing="arrowsLeftRight"
      ariaLabel={`Switch to ${conjunction === "or" ? "And" : "Or"}`}
      onClick={onToggle}
    />
  );

const AddFilter = ({
  properties,
  onAdd,
}: {
  properties: BuilderProperty[];
  onAdd: (property: BuilderProperty) => void;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={ghostStyle}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size="xs" />
        <span>Add filter</span>
      </button>
      {open ? (
        <Popover
          triggerRef={ref}
          position="bottom-start"
          gapY={4}
          onClose={() => setOpen(false)}
        >
          <div className={menuPanelStyle} role="dialog" aria-label="Add filter">
            <MenuRows
              label="Attributes"
              items={properties.map((property) => ({
                key: property.baseUrl,
                text: property.title,
                onPick: () => {
                  onAdd(property);
                  setOpen(false);
                },
              }))}
            />
          </div>
        </Popover>
      ) : null}
    </>
  );
};

/** "Use a variable": the same picker as "@", for the field it sits under. */
export const UseVariable = ({
  onClick,
  buttonRef,
  open,
}: {
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  /** Pressed while its picker is open. */
  open?: boolean;
}) => (
  <button
    ref={buttonRef}
    type="button"
    className={ghostStyle}
    data-open={open || undefined}
    onClick={onClick}
  >
    <VariableIcon />
    <span>Use a variable</span>
  </button>
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
}) => {
  const groups = draft.groups ?? [];
  const allIds = [
    ...draft.conditions,
    ...groups.flatMap((group) => group.conditions),
  ].map((row) => row.id);
  const nextId = Math.max(0, ...allIds, ...groups.map((group) => group.id)) + 1;
  const newRow = (property: BuilderProperty): ConditionRow => ({
    id: nextId,
    propertyBaseUrl: property.baseUrl,
    operator:
      operatorsFor(valueTypeOf(property.property), forGraph).items[0]?.value ??
      null,
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

  if (properties.length === 0) {
    return (
      <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
        Choose an entity type first.
      </span>
    );
  }

  return (
    <div className={builderStyle} data-condition-builder>
      {draft.conditions.map((row, index) => (
        <ConditionRowView
          key={row.id}
          step={step}
          input={input}
          entry={entry}
          row={row}
          properties={properties}
          forGraph={forGraph}
          prefix={
            <Prefix
              index={index}
              conjunction={draft.conjunction}
              onToggle={() =>
                update({
                  ...draft,
                  conjunction: draft.conjunction === "or" ? "and" : "or",
                })
              }
            />
          }
          onChange={(change) =>
            setRows(
              draft.conditions.map((candidate) =>
                candidate.id === row.id
                  ? { ...candidate, ...change }
                  : candidate,
              ),
            )
          }
          onRemove={() =>
            setRows(
              draft.conditions.filter((candidate) => candidate.id !== row.id),
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
      {groups.map((group) => (
        <div
          key={group.id}
          className={groupStyle}
          data-condition-group={group.id}
        >
          {group.conditions.map((row, index) => (
            <Fragment key={row.id}>
              <ConditionRowView
                step={step}
                input={input}
                entry={entry}
                row={row}
                properties={properties}
                forGraph={forGraph}
                prefix={
                  <Prefix
                    index={index}
                    conjunction={group.conjunction}
                    onToggle={() =>
                      setGroup(group.id, {
                        conjunction: group.conjunction === "or" ? "and" : "or",
                      })
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
            </Fragment>
          ))}
          <AddFilter
            properties={properties}
            onAdd={(property) =>
              setGroup(group.id, {
                conditions: [...group.conditions, newRow(property)],
              })
            }
          />
        </div>
      ))}
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <AddFilter
          properties={properties}
          onAdd={(property) => setRows([...draft.conditions, newRow(property)])}
        />
      </div>
    </div>
  );
};

export { VALUE_SUBJECT };
