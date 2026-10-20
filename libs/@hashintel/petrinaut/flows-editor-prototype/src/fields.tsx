import { useEffect, useRef, useState } from "react";

import {
  Button,
  Chip,
  Filter,
  FilterGroup,
  type FilterOperator,
  Menu,
  NumberInput,
  Select,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type CatalogEntry, getCatalogEntry, type InputView } from "./catalog";
import {
  type ConditionOperator,
  type ConditionRow,
  type DraftActionStep,
  type EditorDocument,
  fieldKey,
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
import { describeSource, getSourceShape } from "./shapes";
import { entityChoices, SourceMenu } from "./source-menu";
import { IconTile, kindLabel, mutedTextStyle } from "./ui";

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
    return {
      icon: "playFilled" as const,
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
      owner: step?.description ?? source.stepId,
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
        alignItems: "center",
        gap: "1",
        fontSize: "xs",
        color: "neutral.s90",
        minWidth: "[0]",
      })}
    >
      <IconTile icon={look.icon} tone={look.tone} size="sm" />
      <span
        className={css({
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
      >
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
          anchor={editorRef}
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
 * Query builder: UI only, never SQL; copies the DS Filter chip pattern (ledger, 20 Oct).
 * ------------------------------------------------------------------------------------------------------------- */

type ConditionValues = {
  equals: string;
  notEquals: string;
  contains: string;
  greaterThan: number;
  greaterThanOrEqual: number;
  lessThan: number;
  lessThanOrEqual: number;
  isEmpty: null;
  isNotEmpty: null;
};

const operatorsFor = (
  property: Pick<MockPropertyType, "payloadKind" | "options"> | undefined,
  forGraph: boolean,
): FilterOperator<ConditionValues>[] => {
  const textInput = property?.options
    ? {
        type: "select" as const,
        items: property.options.map((option) => ({
          value: option,
          text: option,
        })),
      }
    : { type: "string" as const };
  const empty: FilterOperator<ConditionValues>[] = [
    { key: "isEmpty", label: "is empty", input: null },
    { key: "isNotEmpty", label: "is not empty", input: null },
  ];
  if (property?.payloadKind === "Number" || property?.payloadKind === "Date") {
    const input =
      property.payloadKind === "Number"
        ? { type: "float" as const }
        : { type: "string" as const, placeholder: "YYYY-MM-DD" };
    return [
      {
        key: "equals",
        label: "=",
        input: textInput.type === "select" ? textInput : { type: "string" },
      },
      { key: "greaterThan", label: ">", input: input as never },
      { key: "greaterThanOrEqual", label: "≥", input: input as never },
      { key: "lessThan", label: "<", input: input as never },
      { key: "lessThanOrEqual", label: "≤", input: input as never },
      ...empty,
    ];
  }
  return [
    { key: "equals", label: "=", input: textInput },
    { key: "notEquals", label: "≠", input: textInput },
    // The graph's filter has no "contains" for text (only `containsSegment`), so Find entities can't offer it.
    ...(forGraph
      ? []
      : [
          {
            key: "contains" as const,
            label: "contains",
            input: { type: "string" as const },
          },
        ]),
    ...empty,
  ];
};

export const QueryField = ({
  step,
  input,
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
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "2" })}
    >
      {mode === "query" ? (
        <Select
          size="sm"
          items={mockEntityTypes.map((type) => ({
            value: type.baseUrl,
            text: type.pluralTitle,
          }))}
          value={draft.entityTypeBaseUrl ?? null}
          onChange={(value) =>
            update({ entityTypeBaseUrl: value ?? undefined, conditions: [] })
          }
          placeholder="Choose what to find"
        />
      ) : null}
      {properties.length > 0 ? (
        <FilterGroup>
          {draft.conditions.map((row, index) => {
            const property = findPropertyType(row.propertyBaseUrl);
            return (
              <div
                key={row.id}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "1",
                })}
              >
                {index > 0 ? (
                  <span
                    className={css({
                      fontSize: "[11px]",
                      fontWeight: "semibold",
                      color: "neutral.s90",
                    })}
                  >
                    AND
                  </span>
                ) : null}
                <Filter<ConditionValues>
                  property={`${key}-${row.id}`}
                  propertyLabel={property?.title ?? "Value"}
                  operators={operatorsFor(property, mode === "query")}
                  value={
                    row.operator
                      ? ({ key: row.operator, value: row.value } as never)
                      : null
                  }
                  onChange={(operator, value) =>
                    updateRow(row.id, {
                      operator: operator as ConditionOperator,
                      value: value as string | number | null,
                    })
                  }
                  removeable={{
                    onRemove: () =>
                      update({
                        ...draft,
                        conditions: draft.conditions.filter(
                          (other) => other.id !== row.id,
                        ),
                      }),
                  }}
                />
              </div>
            );
          })}
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
                      operator: null,
                      value: null,
                    },
                  ],
                }),
            }))}
            trigger={<FilterGroup.AddFilter renderAs="plusLabel" />}
          />
        </FilterGroup>
      ) : mode === "condition" ? null : (
        <span className={mutedTextStyle}>Choose what to find first.</span>
      )}
      {mode === "query" &&
      draft.conditions.some((row) => row.operator === "contains") ? (
        <span className={mutedTextStyle}>
          “contains” is dropped: the graph has no such filter.
        </span>
      ) : null}
    </div>
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
    items: type.properties.map((property) => ({
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
