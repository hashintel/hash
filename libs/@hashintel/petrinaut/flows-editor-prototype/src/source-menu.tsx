import { useState } from "react";

import { Icon, Popover, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import {
  type CatalogEntry,
  getCatalogEntry,
  humanize,
  type InputView,
} from "./catalog";
import {
  START_ID,
  addStep,
  type EditorDocument,
  findStep,
  setInputSource,
} from "./document";
import { useEditor } from "./editor-context";
import { isMockPayloadKind } from "./mock-action-definitions";
import { mockEntities } from "./mock-graph";
import {
  acceptedKinds,
  type SourceOption,
  sourceOptions,
  triggerForInput,
} from "./shapes";
import { kindLabel } from "./ui";

import type { PayloadKind, StepInputSource } from "./engine";
import type { PrdSource } from "./mock-prd-ports";

/** A DS Menu item as ↳ Current draws it: 32 px tall, 6 px in, 8 px corners, a bare 14 px icon, 14 px medium label. */
export const menuRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minHeight: "[32px]",
  paddingX: "1.5",
  paddingY: "[1px]",
  borderRadius: "lg",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s120",
  whiteSpace: "nowrap",
  "& > svg": {
    flexShrink: 0,
    width: "[14px]",
    height: "[14px]",
    color: "neutral.s110",
  },
  "& > svg:last-child:not(:first-child)": { width: "[16px]", height: "[16px]" },
  _hover: { backgroundColor: "neutral.a20" },
  _focusVisible: { backgroundColor: "neutral.a20", outline: "none" },
  "&[data-active], &[data-selected]": { backgroundColor: "neutral.a20" },
});

/** A group of rows, 4 px in, with a hairline between groups. */
export const menuGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  padding: "1",
  "& + &": {
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.a40",
  },
});

/** The DS group title: 28 px, 12 px medium caps, muted. */
export const menuGroupLabelStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "1.5",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[12px]",
  letterSpacing: "[0.48px]",
  textTransform: "uppercase",
  color: "neutral.s90",
});

/** A disabled row that says why a group is empty (J3 C2). */
const menuEmptyRowStyle = css({
  display: "flex",
  alignItems: "center",
  minHeight: "[32px]",
  paddingX: "1.5",
  borderRadius: "lg",
  backgroundColor: "neutral.a20",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "neutral.s120",
  opacity: "[0.5]",
  whiteSpace: "nowrap",
});

/** The DS Menu surface: white, a subtle hairline, 10 px corners and the DS lg shadow. */
export const menuPanelStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "[max-content]",
  minWidth: "[240px]",
  maxWidth: "[380px]",
  maxHeight: "[520px]",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a50",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
  overflow: "hidden",
});

const rowTextStyle = css({
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** "a date", "an entity", "a list of entities": the kind a field takes, for the empty-group rows. */
const kindPhrase = (kinds: readonly string[], array: boolean) => {
  const kind =
    kinds.find((candidate) => !isMockPayloadKind(candidate)) ?? kinds[0];
  if (kind === "VersionedUrl") {
    return "a type";
  }
  const name = kindLabel(kind, false).toLowerCase();
  if (array) {
    return name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`;
  }
  return /^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`;
};

const ownerIcon = (document: EditorDocument, option: SourceOption) => {
  if (option.source.kind === "flow-input") {
    const found = triggerForInput(document, option.source.inputName);
    return {
      icon: found?.definition.icon ?? ("playFilled" as const),
      tone: "neutral" as const,
    };
  }
  if (option.source.kind === "item") {
    return { icon: "rotate" as const, tone: "green" as const };
  }
  if (option.source.kind === "step-output") {
    const step = findStep(document, option.source.stepId)?.step;
    const entry =
      step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)
        : undefined;
    return {
      icon: entry?.icon ?? ("rotate" as const),
      tone: entry?.tone ?? ("green" as const),
    };
  }
  return { icon: "pencil" as const, tone: "neutral" as const };
};

/** A unique flow input name for a field, as the engine's builder names them (`contactEmail`). */
const newInputName = (document: EditorDocument, label: string) => {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, next: string | undefined) =>
      next ? next.toUpperCase() : "",
    );
  let candidate = base || "input";
  for (
    let index = 2;
    document.inputs.some((input) => input.name === candidate);
    index++
  ) {
    candidate = `${base}${index}`;
  }
  return candidate;
};

/**
 * Adds a flow input on Start that fits a field (Ciarán, 20 Oct: if no earlier step fits, lay down a flow input),
 * and returns the source that reads it.
 */
export const addFlowInputFor = (
  document: EditorDocument,
  input: InputView,
  kinds: readonly string[],
): { document: EditorDocument; source: StepInputSource } => {
  const kind = (kinds.find((candidate) => !isMockPayloadKind(candidate)) ??
    "Text") as PayloadKind;
  const name = newInputName(document, input.label);
  return {
    document: {
      ...document,
      inputs: [
        ...document.inputs,
        {
          name,
          label: input.label,
          payloadKind: kind,
          array: input.array,
          required: true,
        },
      ],
    },
    source: { kind: "flow-input", inputName: name },
  };
};

/**
 * Graph lookup as a field source has no engine shape: a lookup is a Find entities step. This places one before the
 * step and connects it when the shapes fit.
 */
export const addLookupStep = (
  document: EditorDocument,
  stepId: string,
  input: InputView,
): { document: EditorDocument; lookupId: string } => {
  const found = findStep(document, stepId);
  const position = document.positions[stepId] ?? { x: 0, y: 0 };
  const incoming = document.wires.find((wire) => wire.target === stepId);
  const { document: withStep, stepId: lookupId } = addStep(
    document,
    "queryEntities",
    {
      parentId: found?.parentId ?? null,
      after: incoming
        ? { stepId: incoming.source, port: incoming.sourcePort }
        : undefined,
      position: { x: position.x - 40, y: position.y - 130 },
    },
  );
  const wired: EditorDocument = {
    ...withStep,
    wires: [
      ...withStep.wires,
      {
        id: `${lookupId}:next->${stepId}`,
        source: lookupId,
        sourcePort: "next",
        target: stepId,
      },
    ],
  };
  // Find entities gives a list; only a list input can take it without a For each or Take first.
  const connected =
    input.array && input.kinds?.includes("EntityId")
      ? setInputSource(wired, stepId, input.name, {
          kind: "step-output",
          stepId: lookupId,
          outputName: "entities",
        })
      : wired;
  return { document: connected, lookupId };
};

export type TypedChoice = {
  label: string;
  source: StepInputSource;
  selected?: boolean;
  /** Shown on hover, e.g. what an entity type is. */
  hint?: string;
};

/**
 * The source menu of a field: flow inputs, the current item, earlier steps' outputs, typed choices, and the two ways
 * out when nothing fits. Only compatible values appear.
 */
export const SourceMenu = ({
  anchor,
  stepId,
  input,
  entry,
  onPick,
  onClose,
  query,
  onTypeValue: onTypeValueProp,
  typedChoices: typedChoicesProp = [],
  typedGroupLabel,
  hideSearch = false,
}: {
  anchor: React.RefObject<Element | null>;
  stepId: string;
  input: InputView;
  entry: CatalogEntry;
  onPick: (source: StepInputSource) => void;
  onClose: () => void;
  /** Set by a free-text field's "@" search. */
  query?: string;
  onTypeValue?: () => void;
  typedChoices?: TypedChoice[];
  /** The heading over the typed choices, e.g. "Entity types". */
  typedGroupLabel?: string;
  hideSearch?: boolean;
}) => {
  const { document, setDocument, setUi } = useEditor();
  const [search, setSearch] = useState("");
  const text = (query ?? search).trim().toLowerCase();
  const kinds = acceptedKinds(document, stepId, input, entry);

  // The draft PRD lists which sources each port takes; ports it doesn't list take every source.
  const allows = (source: PrdSource) =>
    !input.sources || input.sources.includes(source);
  const fromSteps = allows("Previous step");
  const lookupAllowed = allows("HASH graph @lookup");
  const onTypeValue = allows("Manual input") ? onTypeValueProp : undefined;
  const typedChoices =
    lookupAllowed || allows("Manual input") ? typedChoicesProp : [];

  const options = (
    fromSteps ? sourceOptions(document, stepId, input, entry) : []
  ).filter(
    (option) =>
      !text ||
      option.label.toLowerCase().includes(text) ||
      option.ownerLabel.toLowerCase().includes(text),
  );
  const typed = typedChoices.filter(
    (choice) => !text || choice.label.toLowerCase().includes(text),
  );
  const groups = ["Earlier steps", "This item", "Flow inputs"] as const;

  const addFlowInput = () => {
    const { document: next, source } = addFlowInputFor(document, input, kinds);
    setDocument(() => next);
    onPick(source);
  };

  const lookUp = () => {
    const { document: next, lookupId } = addLookupStep(document, stepId, input);
    setDocument(() => next);
    setUi((ui) => ({ ...ui, selectedId: lookupId, openField: null }));
    onClose();
  };

  const nothingFits = options.length === 0 && typed.length === 0;
  const phrase = kindPhrase(kinds, input.array);
  // Search only earns its place on a long list; the mocks show short menus without it.
  const longList = typedChoicesProp.length + options.length > 8;

  return (
    <Popover
      triggerRef={anchor}
      position="bottom-end"
      gapY={4}
      onClose={onClose}
    >
      <div
        className={menuPanelStyle}
        role="dialog"
        aria-label={`Choose ${input.label}`}
      >
        {query === undefined ? null : (
          <div className={menuGroupLabelStyle}>
            <span className={css({ paddingX: "1" })}>
              @{query || " type to search"}
            </span>
          </div>
        )}
        {hideSearch || query !== undefined || !longList ? null : (
          <div className={css({ padding: "1", paddingBottom: "0" })}>
            <TextInput
              value={search}
              onChange={(value) => setSearch(value)}
              placeholder="Search"
              size="sm"
            />
          </div>
        )}
        <OverlayScrollArea className={css({ maxHeight: "[480px]" })}>
          {typed.length > 0 ? (
            <div className={menuGroupStyle}>
              <div className={menuGroupLabelStyle}>
                {typedGroupLabel ??
                  (kinds.includes("EntityId") ? "Entities" : "Values")}
              </div>
              {typed.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  className={menuRowStyle}
                  data-selected={choice.selected || undefined}
                  title={choice.hint}
                  onClick={() => onPick(choice.source)}
                >
                  {choice.selected ? <Icon name="check" size="xs" /> : null}
                  <span className={rowTextStyle}>{choice.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {groups.map((group) => {
            const inGroup = options.filter((option) => option.group === group);
            // The current item only exists inside a For each; the other two groups say why they are empty.
            if (inGroup.length === 0 && (group === "This item" || text)) {
              return null;
            }
            return (
              <div key={group} className={menuGroupStyle}>
                <div className={menuGroupLabelStyle}>{group}</div>
                {inGroup.length === 0 ? (
                  <div className={menuEmptyRowStyle}>
                    {group === "Earlier steps"
                      ? `No earlier step gives ${phrase}`
                      : input.array
                        ? `No flow input gives ${phrase}`
                        : `No flow input is ${phrase}`}
                  </div>
                ) : null}
                {inGroup.map((option) => {
                  const look = ownerIcon(document, option);
                  return (
                    <button
                      key={JSON.stringify(option.source)}
                      type="button"
                      className={menuRowStyle}
                      title={`${option.ownerLabel} › ${option.label} · ${kindLabel(option.shape.payloadKind, option.shape.array)}${option.note ? ` · ${option.note}` : ""}`}
                      onClick={() => onPick(option.source)}
                    >
                      <Icon name={look.icon} size="xs" />
                      <span
                        className={css({
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5",
                          minWidth: "[0]",
                          flex: "1",
                        })}
                      >
                        <span className={rowTextStyle}>{option.label}</span>
                        <span
                          className={css({
                            fontSize: "xs",
                            fontWeight: "normal",
                            lineHeight: "[16px]",
                            color: "neutral.s90",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          })}
                        >
                          {option.ownerLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {nothingFits && text ? (
            <div className={menuGroupStyle}>
              <div className={menuEmptyRowStyle}>
                {`Nothing matches “${query ?? search}”`}
              </div>
            </div>
          ) : null}
          {lookupAllowed ? (
            <div className={menuGroupStyle}>
              <div className={menuGroupLabelStyle}>In the graph</div>
              <button
                type="button"
                className={menuRowStyle}
                onClick={lookUp}
                title="Adds a Find entities step before this one"
              >
                <Icon name="diagramNodes" size="xs" />
                <span className={css({ flex: "1" })}>Look up in the graph</span>
                <Icon name="chevronRight" size="sm" />
              </button>
            </div>
          ) : null}
          {/* The way out when nothing fits (Ciarán, 20 Oct), in the same row grammar. */}
          <div className={menuGroupStyle}>
            {onTypeValue ? (
              <button
                type="button"
                className={menuRowStyle}
                onClick={onTypeValue}
              >
                <Icon name="pencil" size="xs" />
                Type a value
              </button>
            ) : null}
            <button
              type="button"
              className={menuRowStyle}
              onClick={addFlowInput}
            >
              <Icon name="plus" size="xs" />
              Add flow input
            </button>
          </div>
        </OverlayScrollArea>
      </div>
    </Popover>
  );
};

/** Typed choices for an entity field: the entities of the mock graph. */
export const entityChoices = (): TypedChoice[] =>
  mockEntities.map((entity) => ({
    label: entity.label,
    source: {
      kind: "constant",
      payload: { kind: "EntityId", value: entity.entityId },
    },
  }));

export { START_ID, humanize };
