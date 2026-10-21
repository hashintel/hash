import { useEffect, useRef, useState } from "react";

import {
  Button,
  Chip,
  Icon,
  Menu,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { filterRecipe } from "../../../ds-components/src/components/Filter/filter.recipe";
import { type CatalogEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  type ConditionOperator,
  type ConditionRow,
  type DraftActionStep,
  type EditorDocument,
  fieldKey,
  stepLabel,
  findStep,
  type QueryDraft,
  type RefSource,
  setInputSource,
  type TemplatePart,
  VALUE_SUBJECT,
} from "./document";
import { useEditor } from "./editor-context";
import {
  findEntityType,
  findPropertyType,
  type MockPropertyType,
  mockEntities,
  mockEntityTypes,
} from "./mock-graph";
import { describeSource, getSourceShape, triggerForInput } from "./shapes";
import { entityChoices, SourceMenu } from "./source-menu";
import { IconTile, kindLabel, mutedTextStyle, PropertyRow } from "./ui";

import type { StepInputSource } from "./engine";

type FieldProps = {
  step: DraftActionStep;
  input: InputView;
  entry: CatalogEntry;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Tracing what an entity value is, so pickers can offer that type's properties.
 * MOCK-ish: the engine's `EntityId` kind carries no entity type, so the editor follows sources back to a Find
 * entities query to learn it.
 * ------------------------------------------------------------------------------------------------------------- */

export const entityTypeOf = (
  document: EditorDocument,
  source: StepInputSource | undefined,
  stepId: string,
  depth = 0,
): string | undefined => {
  if (!source || depth > 8) {
    return undefined;
  }
  switch (source.kind) {
    case "item": {
      const parentId = findStep(document, stepId)?.parentId;
      const parent = parentId ? findStep(document, parentId)?.step : undefined;
      return parent?.kind === "for-each"
        ? entityTypeOf(document, parent.over, parent.stepId, depth + 1)
        : undefined;
    }
    case "step-output": {
      const producer = findStep(document, source.stepId)?.step;
      if (producer?.kind !== "action") {
        return undefined;
      }
      if (producer.actionDefinitionId === "queryEntities") {
        return document.queries[fieldKey(producer.stepId, "query")]
          ?.entityTypeBaseUrl;
      }
      // List steps pass on their items' kind.
      const passOn =
        producer.inputs.items ??
        producer.inputs.value ??
        producer.inputs.entityId;
      return entityTypeOf(document, passOn, producer.stepId, depth + 1);
    }
    case "flow-input":
      return document.inputEntityTypes[source.inputName];
    case "constant":
      return undefined;
  }
};

/* ---------------------------------------------------------------------------------------------------------------- */

/** The value's own name, for a chip with the source line under it. */
const valueLabel = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
) => describeSource(document, source, stepId).label;

const sourceChipLabel = (
  document: EditorDocument,
  source: StepInputSource,
  stepId: string,
) => {
  const { owner, label } = describeSource(document, source, stepId);
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    const outputs =
      step?.kind === "action"
        ? (getCatalogEntry(step.actionDefinitionId)?.outputs ?? [])
        : [];
    return outputs.length > 1 ? `${owner} › ${label}` : owner;
  }
  return label;
};

const ownerLook = (document: EditorDocument, source: StepInputSource) => {
  if (source.kind === "flow-input") {
    const found = triggerForInput(document, source.inputName);
    return {
      icon: found?.definition.icon ?? ("playFilled" as const),
      tone: "neutral" as const,
      owner: "Start",
    };
  }
  if (source.kind === "step-output") {
    const step = findStep(document, source.stepId)?.step;
    const entry =
      step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)
        : undefined;
    return {
      icon: entry?.icon ?? ("rotate" as const),
      tone: entry?.tone ?? ("green" as const),
      owner: step ? stepLabel(step) : source.stepId,
    };
  }
  return null;
};

/** D27 A: where a value comes from, as a chip under it. The for-each item gets none. */
const SourceLine = ({ source }: { source: StepInputSource }) => {
  const { document } = useEditor();
  const look = ownerLook(document, source);
  const notes = [
    "whenMissing" in source && source.whenMissing === "skip"
      ? "Skips this step when missing"
      : null,
    "wrap" in source && source.wrap ? "As a list of one" : null,
  ].filter(Boolean);
  if (!look) {
    return null;
  }
  return (
    <span
      title={notes.length > 0 ? notes.join(" · ") : look.owner}
      className={css({
        display: "flex",
        alignItems: "flex-start",
        gap: "1",
        fontSize: "xs",
        color: "neutral.s90",
        minWidth: "[0]",
      })}
    >
      <IconTile icon={look.icon} tone={look.tone} size="sm" />
      <span className={css({ overflowWrap: "anywhere" })}>
        {look.owner}
        {notes.length > 0 ? ` · ${notes.join(" · ").toLowerCase()}` : ""}
      </span>
    </span>
  );
};

const useFieldMenu = (stepId: string, inputName: string) => {
  const { ui, setUi } = useEditor();
  const open =
    ui.openField?.stepId === stepId &&
    ui.openField.inputName === inputName &&
    ui.openField.mode === "menu";
  return {
    open,
    setOpen: (next: boolean) =>
      setUi((current) => ({
        ...current,
        openField: next ? { stepId, inputName, mode: "menu" } : null,
      })),
  };
};

const typedKinds = [
  "Text",
  "Number",
  "Boolean",
  "Date",
  "EntityId",
  "VersionedUrl",
];

const TypedEditor = ({
  kind,
  value,
  onChange,
}: {
  kind: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) => {
  switch (kind) {
    case "Number":
      return (
        <NumberInput
          value={typeof value === "number" ? value : null}
          onChange={(next) => onChange(next)}
          size="sm"
          width="fullWidth"
        />
      );
    case "Boolean":
      return (
        <Select
          size="sm"
          items={[
            { value: "true", text: "Yes" },
            { value: "false", text: "No" },
          ]}
          value={typeof value === "boolean" ? (value ? "true" : "false") : null}
          onChange={(next) => onChange(next === "true")}
          placeholder="Choose"
        />
      );
    case "Date":
      return (
        <TextInput
          type="date"
          size="sm"
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
        />
      );
    case "EntityId":
      return (
        <Select
          size="sm"
          searchable
          items={mockEntities.map((entity) => ({
            value: entity.entityId,
            text: entity.label,
          }))}
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder="Choose an entity"
        />
      );
    case "VersionedUrl":
      return (
        <Select
          size="sm"
          items={mockEntityTypes.map((type) => ({
            value: type.entityTypeId,
            text: type.title,
          }))}
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next)}
          placeholder="Choose a type"
        />
      );
    default:
      return (
        <TextInput
          size="sm"
          value={typeof value === "string" ? value : ""}
          onChange={(next) => onChange(next)}
          placeholder="Type a value"
        />
      );
  }
};

/** A field that takes one value: typed, or a reference picked from the source menu. */
export const ValueField = ({ step, input, entry }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const { open, setOpen } = useFieldMenu(step.stepId, input.name);
  const [typing, setTyping] = useState(false);
  const source = step.inputs[input.name];
  const kinds = input.kinds ?? [];
  const typedKind = kinds.find((kind) => typedKinds.includes(kind));

  const set = (next: StepInputSource | null) =>
    setDocument((current) =>
      setInputSource(current, step.stepId, input.name, next),
    );

  const menu = open ? (
    <SourceMenu
      anchor={anchorRef}
      stepId={step.stepId}
      input={input}
      entry={entry}
      onClose={() => setOpen(false)}
      onPick={(picked) => {
        set(picked);
        setOpen(false);
      }}
      onTypeValue={
        typedKind
          ? () => {
              set(null);
              setTyping(true);
              setOpen(false);
            }
          : undefined
      }
      typedChoices={kinds.includes("EntityId") ? entityChoices() : []}
    />
  ) : null;

  if (source && source.kind !== "constant") {
    return (
      <div
        ref={anchorRef}
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <Chip
          size="sm"
          color="blue"
          onClick={() => setOpen(true)}
          removeable={{ onRemove: () => set(null), "aria-label": "Clear" }}
        >
          {valueLabel(document, source, step.stepId)}
        </Chip>
        <SourceLine source={source} />
        {menu}
      </div>
    );
  }

  if (
    typedKind &&
    (source?.kind === "constant" || typing || typedKind !== "EntityId")
  ) {
    return (
      <div
        ref={anchorRef}
        className={css({ display: "flex", gap: "1", alignItems: "center" })}
      >
        <div className={css({ flex: "1", minWidth: "[0]" })}>
          <TypedEditor
            kind={typedKind}
            value={
              source?.kind === "constant" ? source.payload.value : undefined
            }
            onChange={(value) =>
              set(
                value === "" || value === null
                  ? null
                  : {
                      kind: "constant",
                      payload: { kind: typedKind as never, value },
                    },
              )
            }
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          iconName="at"
          aria-label={`Use a value from an earlier step for ${input.label}`}
          tooltip="Use a value from an earlier step"
          onClick={() => setOpen(true)}
        />
        {menu}
      </div>
    );
  }

  return (
    <div ref={anchorRef}>
      <Button
        size="sm"
        variant="subtle"
        iconName="plus"
        onClick={() => setOpen(true)}
      >
        Choose
      </Button>
      {menu}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Free text with "@" chips (ledger, 12–13 Oct: a trigger symbol inserts an inline chip, found by search).
 * ------------------------------------------------------------------------------------------------------------- */

const chipClass = css({
  display: "inline-flex",
  alignItems: "center",
  paddingX: "[6px]",
  marginX: "[1px]",
  borderRadius: "sm",
  backgroundColor: "blue.s20",
  color: "blue.s110",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[18px]",
  userSelect: "all",
  whiteSpace: "nowrap",
});

const editorClass = css({
  minHeight: "[60px]",
  width: "[100%]",
  paddingX: "2",
  paddingY: "[6px]",
  fontSize: "sm",
  lineHeight: "[22px]",
  color: "neutral.s120",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s50",
  borderRadius: "md",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  outline: "none",
  _focus: {
    borderColor: "blue.s90",
    boxShadow: "[0 0 0 2px var(--colors-blue-a30)]",
  },
  "&:empty::before": {
    content: "attr(data-placeholder)",
    color: "neutral.s80",
  },
});

const renderParts = (
  element: HTMLElement,
  parts: TemplatePart[],
  label: (source: RefSource) => string,
) => {
  element.replaceChildren(
    ...parts.map((part) => {
      if (part.kind === "text") {
        return globalThis.document.createTextNode(part.text);
      }
      const chip = globalThis.document.createElement("span");
      chip.contentEditable = "false";
      chip.className = chipClass;
      chip.dataset.ref = JSON.stringify(part.source);
      chip.textContent = label(part.source);
      return chip;
    }),
  );
};

const readParts = (element: HTMLElement): TemplatePart[] => {
  const parts: TemplatePart[] = [];
  for (const node of element.childNodes) {
    if (node instanceof HTMLElement && node.dataset.ref) {
      parts.push({
        kind: "ref",
        source: JSON.parse(node.dataset.ref) as RefSource,
      });
    } else {
      const text = node.textContent ?? "";
      const last = parts.at(-1);
      if (last?.kind === "text") {
        last.text += text;
      } else {
        parts.push({ kind: "text", text });
      }
    }
  }
  return parts;
};

export const MentionField = ({ step, input, entry }: FieldProps) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const editorRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const key = fieldKey(step.stepId, input.name);
  const stored = document.templates[key];
  const fallback = step.inputs[input.name];
  const parts: TemplatePart[] =
    stored ??
    (fallback
      ? fallback.kind === "constant"
        ? [{ kind: "text", text: String(fallback.payload.value) }]
        : [{ kind: "ref", source: fallback }]
      : []);
  const serialized = JSON.stringify(parts);
  const lastWritten = useRef<string | null>(null);
  const [mention, setMention] = useState<{ query: string } | null>(
    ui.openField?.stepId === step.stepId &&
      ui.openField.inputName === input.name &&
      ui.openField.mode === "mention"
      ? { query: "" }
      : null,
  );

  const label = (source: RefSource) =>
    sourceChipLabel(document, source, step.stepId);

  useEffect(() => {
    const element = editorRef.current;
    if (element && serialized !== lastWritten.current) {
      renderParts(element, JSON.parse(serialized) as TemplatePart[], label);
      lastWritten.current = serialized;
    }
  });

  const commit = () => {
    const element = editorRef.current;
    if (!element) {
      return;
    }
    const next = readParts(element);
    lastWritten.current = JSON.stringify(next);
    setDocument((current) => ({
      ...current,
      templates: { ...current.templates, [key]: next },
    }));
  };

  /** Finds "@query" just before the caret. */
  const findMention = () => {
    const selection = globalThis.getSelection();
    const node = selection?.anchorNode;
    if (!selection || !node || node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const before = (node.textContent ?? "").slice(0, selection.anchorOffset);
    const match = /@([^@\n]{0,40})$/.exec(before);
    return match
      ? {
          node,
          start: match.index,
          end: selection.anchorOffset,
          query: match[1] ?? "",
        }
      : null;
  };

  const insert = (source: StepInputSource) => {
    const element = editorRef.current;
    if (!element || source.kind === "constant") {
      return;
    }
    const found = findMention();
    const chip = globalThis.document.createElement("span");
    chip.contentEditable = "false";
    chip.className = chipClass;
    chip.dataset.ref = JSON.stringify(source);
    chip.textContent = label(source);
    const space = globalThis.document.createTextNode(" ");
    if (found) {
      const text = found.node.textContent ?? "";
      const after = globalThis.document.createTextNode(text.slice(found.end));
      found.node.textContent = text.slice(0, found.start);
      found.node.parentNode?.insertBefore(after, found.node.nextSibling);
      found.node.parentNode?.insertBefore(space, after);
      found.node.parentNode?.insertBefore(chip, space);
    } else {
      element.append(chip, space);
    }
    setMention(null);
    setUi((current) => ({ ...current, openField: null }));
    commit();
    element.focus();
    const range = globalThis.document.createRange();
    range.setStartAfter(space);
    range.collapse(true);
    globalThis.getSelection()?.removeAllRanges();
    globalThis.getSelection()?.addRange(range);
  };

  const engineValue = parts.filter(
    (part) => part.kind === "ref" || part.text.trim() !== "",
  );
  const mixed =
    engineValue.length > 1 && engineValue.some((part) => part.kind === "ref");

  return (
    <div
      ref={fieldRef}
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      <div
        ref={editorRef}
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label={input.label}
        contentEditable
        suppressContentEditableWarning
        className={editorClass}
        data-placeholder="Type, or @ to use a value"
        onInput={() => {
          const found = findMention();
          setMention(found ? { query: found.query } : null);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mention) {
            event.preventDefault();
            setMention(null);
          }
        }}
      />
      {mixed ? (
        <Tooltip content="The engine takes one value per input, so text mixed with values has no engine shape yet. Kept in the prototype's mock layer.">
          <span className={mutedTextStyle}>Text with values · mock</span>
        </Tooltip>
      ) : null}
      {mention ? (
        <SourceMenu
          anchor={fieldRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          query={mention.query}
          onClose={() => {
            setMention(null);
            setUi((current) => ({ ...current, openField: null }));
          }}
          onPick={insert}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * List fields (To, entities): chips and a + menu (ledger, 12–13 Oct).
 * ------------------------------------------------------------------------------------------------------------- */

export const ListField = ({ step, input, entry }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const { open, setOpen } = useFieldMenu(step.stepId, input.name);
  const [typing, setTyping] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const key = fieldKey(step.stepId, input.name);
  const existing = step.inputs[input.name];
  const items = document.lists[key] ?? (existing ? [existing] : []);
  const kinds = input.kinds ?? [];
  const textKind = kinds.includes("Text");

  const setItems = (next: StepInputSource[]) =>
    setDocument((current) => ({
      ...current,
      lists: { ...current.lists, [key]: next },
    }));

  const itemLabel = (item: StepInputSource) => {
    if (item.kind === "constant") {
      const entity = mockEntities.find(
        (candidate) => candidate.entityId === item.payload.value,
      );
      return entity?.label ?? String(item.payload.value);
    }
    return sourceChipLabel(document, item, step.stepId);
  };

  const mixed =
    items.length > 1 && items.some((item) => item.kind !== "constant");

  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      <div
        ref={anchorRef}
        className={css({
          display: "flex",
          flexWrap: "wrap",
          gap: "1",
          alignItems: "center",
        })}
      >
        {items.map((item, index) => (
          <Chip
            key={JSON.stringify(item)}
            size="sm"
            color={item.kind === "constant" ? "grey" : "blue"}
            removeable={{
              onRemove: () =>
                setItems(items.filter((_, other) => other !== index)),
              "aria-label": "Remove",
            }}
          >
            {itemLabel(item)}
          </Chip>
        ))}
        <Button
          size="xs"
          variant="ghost"
          iconName="plus"
          aria-label={`Add to ${input.label}`}
          tooltip="Add"
          onClick={() => setOpen(true)}
        />
      </div>
      {items.length === 1 && items[0]!.kind !== "constant" ? (
        <SourceLine source={items[0]!} />
      ) : null}
      {showTyping ? (
        <TextInput
          size="sm"
          value={typing}
          placeholder="Type and press Enter"
          onChange={(value) => setTyping(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && typing.trim()) {
              setItems([
                ...items,
                {
                  kind: "constant",
                  payload: { kind: "Text", value: typing.trim() },
                },
              ]);
              setTyping("");
              setShowTyping(false);
            }
          }}
        />
      ) : null}
      {mixed ? (
        <Tooltip content="The engine takes one source per input: a list, or one value wrapped as a list. Several sources in one list are kept in the prototype's mock layer.">
          <span className={mutedTextStyle}>Several sources · mock</span>
        </Tooltip>
      ) : null}
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            setItems([...items, picked]);
            setOpen(false);
          }}
          onTypeValue={
            textKind
              ? () => {
                  setShowTyping(true);
                  setOpen(false);
                }
              : undefined
          }
          typedChoices={kinds.includes("EntityId") ? entityChoices() : []}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Query builder (Journey 3): UI only, never SQL (ledger, 20 Oct). Each condition is subject · operator · value, joined
 * by "and". The value slot takes a typed value, or "@" for an earlier step's output or a flow input.
 * ------------------------------------------------------------------------------------------------------------- */

type OperatorChoice = {
  value: ConditionOperator;
  text: string;
  takesValue: boolean;
};

const operatorsFor = (
  property:
    | Pick<MockPropertyType, "payloadKind" | "options" | "linksTo">
    | undefined,
  forGraph: boolean,
): OperatorChoice[] => {
  const empty: OperatorChoice[] = [
    { value: "isEmpty", text: "is empty", takesValue: false },
    { value: "isNotEmpty", text: "is not empty", takesValue: false },
  ];
  if (property?.linksTo) {
    return [
      { value: "isAnyOf", text: "is any of", takesValue: true },
      ...empty,
    ];
  }
  if (property?.payloadKind === "Date") {
    return [
      { value: "isIn", text: "is in", takesValue: true },
      { value: "equals", text: "=", takesValue: true },
      { value: "greaterThan", text: ">", takesValue: true },
      { value: "lessThan", text: "<", takesValue: true },
      ...empty,
    ];
  }
  if (property?.payloadKind === "Number") {
    return [
      { value: "equals", text: "=", takesValue: true },
      { value: "notEquals", text: "≠", takesValue: true },
      { value: "greaterThan", text: ">", takesValue: true },
      { value: "greaterThanOrEqual", text: "≥", takesValue: true },
      { value: "lessThan", text: "<", takesValue: true },
      { value: "lessThanOrEqual", text: "≤", takesValue: true },
      ...empty,
    ];
  }
  return [
    { value: "equals", text: "is", takesValue: true },
    { value: "notEquals", text: "is not", takesValue: true },
    // The graph's filter has no "contains" for text (only `containsSegment`), so Find entities can't offer it.
    ...(forGraph
      ? []
      : [{ value: "contains" as const, text: "contains", takesValue: true }]),
    ...empty,
  ];
};

const ConditionRowEditor = ({
  step,
  input,
  entry,
  row,
  properties,
  forGraph,
  onChange,
  onRemove,
}: {
  step: DraftActionStep;
  input: InputView;
  entry: CatalogEntry;
  row: ConditionRow;
  properties: { baseUrl: string; title: string; property?: MockPropertyType }[];
  forGraph: boolean;
  onChange: (change: Partial<ConditionRow>) => void;
  onRemove: () => void;
}) => {
  const { document, ui, setUi } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuKey = `${input.name}:condition${row.id}`;
  const open =
    ui.openField?.stepId === step.stepId && ui.openField.inputName === menuKey;
  const [mention, setMention] = useState<string | undefined>(
    open && ui.openField?.mode === "mention" ? "" : undefined,
  );
  const setOpen = (next: boolean, mode: "menu" | "mention" = "menu") =>
    setUi((current) => ({
      ...current,
      openField: next
        ? { stepId: step.stepId, inputName: menuKey, mode }
        : null,
    }));

  const subject = properties.find(
    (candidate) => candidate.baseUrl === row.propertyBaseUrl,
  );
  const property = subject?.property ?? findPropertyType(row.propertyBaseUrl);
  const operators = operatorsFor(property, forGraph);
  const operator = operators.find(
    (candidate) => candidate.value === row.operator,
  );
  const valueKind = property?.payloadKind ?? "Text";
  const valueInput: InputView = {
    name: menuKey,
    label: subject?.title ?? "Value",
    array: row.operator === "isAnyOf",
    required: true,
    hasDefault: false,
    kinds: [valueKind],
  };
  const sourceLook = row.valueSource
    ? describeSource(document, row.valueSource, step.stepId)
    : null;

  // The DS Filter chip's own recipe and slots, so the row matches the Figma DS filter 1:1.
  const classes = filterRecipe({
    size: "sm",
    complete: true,
    invalid: false,
    disabled: false,
  });
  const sourceIcon =
    row.valueSource?.kind === "flow-input"
      ? (triggerForInput(document, row.valueSource.inputName)?.definition
          .icon ?? "hand")
      : "search";

  return (
    <div
      ref={anchorRef}
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      <div className={classes.root} role="group" data-condition-row={row.id}>
        <Menu
          items={properties.map((candidate) => ({
            id: candidate.baseUrl,
            text: candidate.title,
            selected: candidate.baseUrl === row.propertyBaseUrl,
            onClick: () =>
              onChange({
                propertyBaseUrl: candidate.baseUrl,
                operator:
                  operatorsFor(candidate.property, forGraph)[0]?.value ?? null,
                value: null,
                valueSource: undefined,
              }),
          }))}
          trigger={
            <button
              type="button"
              data-part="property"
              className={classes.property}
            >
              {subject?.title ?? "Value"}
            </button>
          }
        />
        <Menu
          items={operators.map(({ value, text }) => ({
            id: value,
            text,
            selected: value === row.operator,
            onClick: () => onChange({ operator: value }),
          }))}
          trigger={
            <button type="button" className={classes.trigger}>
              <span className={classes.triggerLabel}>
                {operator?.text ?? "…"}
              </span>
            </button>
          }
        />
        {operator?.takesValue === false ? null : row.valueSource &&
          sourceLook ? (
          <span data-part="input-slot" className={classes.inputSlot}>
            <Tooltip
              content={`${sourceLook.owner} › ${sourceLook.label}. Click to change.`}
            >
              <button
                type="button"
                className={classes.trigger}
                onClick={() => setOpen(true)}
                aria-label={`Change the source of ${valueInput.label}`}
              >
                <Icon name={sourceIcon} size="xs" />
                <span className={classes.triggerLabel}>{sourceLook.label}</span>
              </button>
            </Tooltip>
          </span>
        ) : property?.options ? (
          <Menu
            items={property.options.map((option) => ({
              id: option,
              text: option,
              selected: option === row.value,
              onClick: () => onChange({ value: option }),
            }))}
            trigger={
              <button type="button" className={classes.trigger}>
                <span className={classes.triggerLabel}>
                  {typeof row.value === "string" ? row.value : "Value"}
                </span>
              </button>
            }
          />
        ) : (
          <span data-part="input-slot" className={classes.inputSlot}>
            <input
              className={classes.input}
              value={row.value === null ? "" : String(row.value)}
              placeholder={valueKind === "Date" ? "Month, or @" : "Value, or @"}
              aria-label={`${valueInput.label} value`}
              onChange={(event) => {
                const next = event.target.value;
                const at = next.lastIndexOf("@");
                if (at >= 0) {
                  setMention(next.slice(at + 1));
                  setOpen(true, "mention");
                  onChange({ value: next.slice(0, at) || null });
                  return;
                }
                onChange({
                  value:
                    next === ""
                      ? null
                      : valueKind === "Number" && !Number.isNaN(Number(next))
                        ? Number(next)
                        : next,
                });
              }}
            />
          </span>
        )}
        <Menu
          items={[
            {
              id: "source",
              text: "Use a value from an earlier step",
              onClick: () => setOpen(true),
            },
            ...(row.valueSource
              ? [
                  {
                    id: "typed",
                    text: "Type a value instead",
                    onClick: () => onChange({ valueSource: undefined }),
                  },
                ]
              : []),
            {
              id: "remove",
              text: "Remove condition",
              tone: "error" as const,
              onClick: onRemove,
            },
          ]}
          trigger={
            <button
              type="button"
              data-part="remove"
              className={classes.remove}
              aria-label="Condition options"
            >
              <Icon name="ellipsisVertical" size="xs" />
            </button>
          }
        />
      </div>
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={valueInput}
          entry={entry}
          query={mention}
          onClose={() => {
            setMention(undefined);
            setOpen(false);
          }}
          onPick={(source) => {
            onChange({ valueSource: source, value: null });
            setMention(undefined);
            setOpen(false);
          }}
          onTypeValue={() => {
            onChange({ valueSource: undefined });
            setMention(undefined);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

/** Entity type with the same source menu: a fixed type, an earlier step, a flow input, or the graph (Journey 3, B2). */
const EntityTypeField = ({
  step,
  entry,
  draft,
  update,
}: {
  step: DraftActionStep;
  entry: CatalogEntry;
  draft: QueryDraft;
  update: (next: QueryDraft) => void;
}) => {
  const { document, ui, setUi } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const open =
    ui.openField?.stepId === step.stepId &&
    ui.openField.inputName === "entityType";
  const setOpen = (next: boolean) =>
    setUi((current) => ({
      ...current,
      openField: next
        ? { stepId: step.stepId, inputName: "entityType", mode: "menu" }
        : null,
    }));
  const typeInput: InputView = {
    name: "entityType",
    label: "Entity type",
    array: false,
    required: true,
    hasDefault: false,
    kinds: ["VersionedUrl"],
    sources: ["HASH graph @lookup", "Previous step"],
  };
  const selected = findEntityType(draft.entityTypeBaseUrl);
  const sourceLook = draft.entityTypeSource
    ? describeSource(document, draft.entityTypeSource, step.stepId)
    : null;

  return (
    <div ref={anchorRef}>
      <Button
        size="sm"
        variant="subtle"
        iconName="chevronDown"
        iconPosition="right"
        onClick={() => setOpen(true)}
      >
        {sourceLook
          ? `${sourceLook.owner} › ${sourceLook.label}`
          : (selected?.title ?? "Choose a type")}
      </Button>
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={typeInput}
          entry={entry}
          typedGroupLabel="Entity types"
          typedChoices={mockEntityTypes.map((type) => ({
            label: type.title,
            hint: type.description,
            selected:
              !draft.entityTypeSource &&
              type.baseUrl === draft.entityTypeBaseUrl,
            source: {
              kind: "constant",
              payload: { kind: "VersionedUrl", value: type.entityTypeId },
            },
          }))}
          onClose={() => setOpen(false)}
          onPick={(source) => {
            if (source.kind === "constant") {
              const type = mockEntityTypes.find(
                (candidate) => candidate.entityTypeId === source.payload.value,
              );
              update({
                entityTypeBaseUrl: type?.baseUrl,
                entityTypeSource: undefined,
                conditions:
                  type?.baseUrl === draft.entityTypeBaseUrl
                    ? draft.conditions
                    : [],
              });
            } else {
              update({ ...draft, entityTypeSource: source });
            }
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

/**
 * Find entities' query, or If / Filter list's condition. The Query block is stacked (key above, builder below), as
 * in Journey 3.
 */
export const QueryField = ({
  step,
  input,
  entry,
  mode,
  typeHint,
}: FieldProps & { mode: "query" | "condition"; typeHint?: string }) => {
  const { document, setDocument } = useEditor();
  const key = fieldKey(step.stepId, input.name);
  const draft: QueryDraft = document.queries[key] ?? { conditions: [] };
  const typeBaseUrl = mode === "query" ? draft.entityTypeBaseUrl : typeHint;
  const entityType = findEntityType(typeBaseUrl);

  const update = (next: QueryDraft) =>
    setDocument((current) => ({
      ...current,
      queries: { ...current.queries, [key]: next },
    }));

  const properties: {
    baseUrl: string;
    title: string;
    property?: MockPropertyType;
  }[] = entityType
    ? entityType.properties.map((property) => ({
        baseUrl: property.baseUrl,
        title: property.title,
        property,
      }))
    : mode === "condition"
      ? [{ baseUrl: VALUE_SUBJECT, title: "Value" }]
      : [];

  const nextId = Math.max(0, ...draft.conditions.map((row) => row.id)) + 1;

  const updateRow = (id: number, change: Partial<ConditionRow>) =>
    update({
      ...draft,
      conditions: draft.conditions.map((row) =>
        row.id === id ? { ...row, ...change } : row,
      ),
    });

  return (
    <>
      {mode === "query" ? (
        <PropertyRow
          label="Entity type"
          hover="Entity type · the kind of entity to find. At least one of Webs, Entity type or Query."
        >
          <EntityTypeField
            step={step}
            entry={entry}
            draft={draft}
            update={update}
          />
        </PropertyRow>
      ) : null}
      {mode === "query" &&
      !draft.entityTypeBaseUrl &&
      !draft.entityTypeSource &&
      draft.conditions.length === 0 ? (
        <div
          className={css({
            paddingX: "4",
            fontSize: "xs",
            color: "neutral.s90",
          })}
        >
          Set at least one of Webs, Entity type or Query.
        </div>
      ) : null}
      <div
        className={css({
          paddingX: "4",
          paddingY: "[6px]",
          display: "flex",
          flexDirection: "column",
          gap: "2",
        })}
      >
        <span className={css({ fontSize: "sm", color: "neutral.s90" })}>
          {mode === "query" ? "Query" : input.label}
        </span>
        {draft.conditions.map((row, index) => (
          <div
            key={row.id}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
          >
            {index > 0 ? (
              <span className={css({ fontSize: "xs", color: "neutral.s90" })}>
                and
              </span>
            ) : null}
            <ConditionRowEditor
              step={step}
              input={input}
              entry={entry}
              row={row}
              properties={properties}
              forGraph={mode === "query"}
              onChange={(change) => updateRow(row.id, change)}
              onRemove={() =>
                update({
                  ...draft,
                  conditions: draft.conditions.filter(
                    (other) => other.id !== row.id,
                  ),
                })
              }
            />
          </div>
        ))}
        {properties.length > 0 ? (
          <div>
            <Menu
              items={properties.map((property) => ({
                id: property.baseUrl,
                text: property.title,
                onClick: () =>
                  update({
                    ...draft,
                    conditions: [
                      ...draft.conditions,
                      {
                        id: nextId,
                        propertyBaseUrl: property.baseUrl,
                        operator:
                          operatorsFor(property.property, mode === "query")[0]
                            ?.value ?? null,
                        value: null,
                      },
                    ],
                  }),
              }))}
              trigger={
                <Button size="sm" variant="subtle" iconName="plus">
                  Add condition
                </Button>
              }
            />
          </div>
        ) : (
          <span className={mutedTextStyle}>Choose an entity type first.</span>
        )}
      </div>
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Read entity's property (#10051): a property of the entity's type, which also declares the output's kind.
 * ------------------------------------------------------------------------------------------------------------- */

export const PropertyField = ({ step, input }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const typeBaseUrl = entityTypeOf(document, step.inputs.entityId, step.stepId);
  const entityType = findEntityType(typeBaseUrl);
  const source = step.inputs[input.name];
  const current =
    source?.kind === "constant"
      ? (source.payload.value as { propertyTypeBaseUrl?: string } | null)
          ?.propertyTypeBaseUrl
      : undefined;

  const groups = (entityType ? [entityType] : mockEntityTypes).map((type) => ({
    id: type.baseUrl,
    label: type.title,
    // Read entity reads plain values; links are followed with another step.
    items: type.properties
      .filter((property) => !("linksTo" in property && property.linksTo))
      .map((property) => ({
        value: property.baseUrl,
        text: entityType ? property.title : `${type.title} › ${property.title}`,
      })),
  }));

  return (
    <Select
      size="sm"
      searchable
      items={entityType ? groups[0]!.items : groups}
      value={current ?? null}
      placeholder="Choose a property"
      onChange={(value) => {
        const property = findPropertyType(value ?? undefined);
        setDocument((currentDocument) =>
          setInputSource(
            currentDocument,
            step.stepId,
            input.name,
            property
              ? {
                  kind: "constant",
                  payload: {
                    kind: "EntityProperty" as never,
                    value: {
                      kind: "entityProperty",
                      propertyTypeBaseUrl: property.baseUrl,
                      payloadKind: property.payloadKind,
                    },
                  },
                }
              : null,
          ),
        );
      }}
    />
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Update / Create entity: one row per property changed (#10060). Values may come from earlier steps, but the PR
 * takes the patches as one constant, so a referenced value has no engine shape yet.
 * ------------------------------------------------------------------------------------------------------------- */

/** One property's new value: typed, or picked from earlier steps through the same source menu. */
const PatchValue = ({
  step,
  input,
  source,
  onChange,
}: {
  step: DraftActionStep;
  input: InputView;
  source: StepInputSource | null;
  onChange: (source: StepInputSource | null) => void;
}) => {
  const { document } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const kind = input.kinds?.[0] ?? "Text";
  const entry = getCatalogEntry(step.actionDefinitionId)!;
  return (
    <div
      ref={anchorRef}
      className={css({ display: "flex", flexDirection: "column", gap: "1" })}
    >
      {source && source.kind !== "constant" ? (
        <>
          <Chip
            size="sm"
            color="blue"
            onClick={() => setOpen(true)}
            removeable={{
              onRemove: () => onChange(null),
              "aria-label": "Clear",
            }}
          >
            {valueLabel(document, source, step.stepId)}
          </Chip>
          <SourceLine source={source} />
        </>
      ) : (
        <div
          className={css({ display: "flex", gap: "1", alignItems: "center" })}
        >
          <div className={css({ flex: "1" })}>
            <TypedEditor
              kind={kind}
              value={
                source?.kind === "constant" ? source.payload.value : undefined
              }
              onChange={(value) =>
                onChange(
                  value === "" || value === null
                    ? null
                    : {
                        kind: "constant",
                        payload: { kind: kind as never, value },
                      },
                )
              }
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconName="at"
            aria-label="Use a value from an earlier step"
            tooltip="Use a value from an earlier step"
            onClick={() => setOpen(true)}
          />
        </div>
      )}
      {open ? (
        <SourceMenu
          anchor={anchorRef}
          stepId={step.stepId}
          input={input}
          entry={entry}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            onChange(picked);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

export const PatchField = ({ step, input }: FieldProps) => {
  const { document, setDocument } = useEditor();
  const patches = document.patches[step.stepId] ?? [];
  const typeBaseUrl =
    step.actionDefinitionId === "createEntity"
      ? mockEntityTypes.find(
          (type) =>
            step.inputs.entityTypeId?.kind === "constant" &&
            type.entityTypeId === step.inputs.entityTypeId.payload.value,
        )?.baseUrl
      : entityTypeOf(document, step.inputs.entityId, step.stepId);
  const entityType = findEntityType(typeBaseUrl);
  const available = (entityType ? [entityType] : mockEntityTypes).flatMap(
    (type) => type.properties.map((property) => ({ type, property })),
  );

  const setPatches = (next: typeof patches) =>
    setDocument((current) => ({
      ...current,
      patches: { ...current.patches, [step.stepId]: next },
    }));

  const nextId = Math.max(0, ...patches.map((patch) => patch.id)) + 1;

  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "2" })}
    >
      {patches.map((patch) => {
        const property = findPropertyType(patch.propertyBaseUrl);
        const patchInput: InputView = {
          name: `${input.name}:${patch.id}`,
          label: property?.title ?? "Value",
          array: false,
          required: true,
          hasDefault: false,
          kinds: [property?.payloadKind ?? "Text"],
        };
        return (
          <div
            key={patch.id}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              })}
            >
              <span
                className={css({
                  fontSize: "xs",
                  fontWeight: "medium",
                  color: "neutral.s110",
                })}
              >
                {property?.title ?? "Property"}
              </span>
              <Button
                size="xs"
                variant="ghost"
                iconName="close"
                aria-label={`Remove ${property?.title ?? "change"}`}
                tooltip="Remove"
                onClick={() =>
                  setPatches(patches.filter((other) => other.id !== patch.id))
                }
              />
            </div>
            <PatchValue
              step={step}
              input={patchInput}
              source={patch.source}
              onChange={(source) =>
                setPatches(
                  patches.map((other) =>
                    other.id === patch.id ? { ...other, source } : other,
                  ),
                )
              }
            />
          </div>
        );
      })}
      <Menu
        items={available.map(({ type, property }) => ({
          id: property.baseUrl,
          text: entityType
            ? property.title
            : `${type.title} › ${property.title}`,
          onClick: () =>
            setPatches([
              ...patches,
              { id: nextId, propertyBaseUrl: property.baseUrl, source: null },
            ]),
        }))}
        trigger={
          <Button size="sm" variant="ghost" iconName="plus">
            Add property
          </Button>
        }
      />
    </div>
  );
};

export const kindHover = (input: InputView, kinds: readonly string[]) =>
  `${kindLabel(kinds[0], input.array)}${
    kinds.length > 1
      ? ` (or ${kinds
          .slice(1)
          .map((kind) => kindLabel(kind))
          .join(", ")})`
      : ""
  }${input.required && !input.hasDefault ? " · required" : ""}`;

export const isFreeText = (input: InputView) =>
  !input.array &&
  input.kinds?.length === 1 &&
  input.kinds[0] === "Text" &&
  [
    "instructions",
    "context",
    "body",
    "subject",
    "prompt",
    "question",
    "userGoal",
    "relevantEntitiesPrompt",
    "reportSpecification",
    "description",
  ].includes(input.name);

export { getSourceShape };
