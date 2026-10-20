import { useState } from "react";

import { Button, Popover, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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
import { acceptedKinds, type SourceOption, sourceOptions } from "./shapes";
import { IconTile, kindLabel } from "./ui";

import type { PayloadKind, StepInputSource } from "./engine";

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  paddingX: "2",
  paddingY: "[5px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "sm",
  color: "neutral.s120",
  _hover: { backgroundColor: "neutral.s15" },
  _focusVisible: { backgroundColor: "neutral.s15", outline: "none" },
  "&[data-active]": { backgroundColor: "neutral.s15" },
});

const groupLabelStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  color: "neutral.s90",
  textTransform: "uppercase",
  letterSpacing: "[0.04em]",
  paddingX: "2",
  paddingTop: "2",
  paddingBottom: "1",
});

export const menuPanelStyle = css({
  width: "[300px]",
  maxHeight: "[380px]",
  overflowY: "auto",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.12)]",
  padding: "2",
});

const ownerIcon = (document: EditorDocument, option: SourceOption) => {
  if (option.source.kind === "flow-input") {
    return { icon: "playFilled" as const, tone: "neutral" as const };
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

export type TypedChoice = { label: string; source: StepInputSource };

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
  onTypeValue,
  typedChoices = [],
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
  hideSearch?: boolean;
}) => {
  const { document, setDocument, setUi } = useEditor();
  const [search, setSearch] = useState("");
  const text = (query ?? search).trim().toLowerCase();
  const kinds = acceptedKinds(document, stepId, input, entry);

  const options = sourceOptions(document, stepId, input, entry).filter(
    (option) =>
      !text ||
      option.label.toLowerCase().includes(text) ||
      option.ownerLabel.toLowerCase().includes(text),
  );
  const typed = typedChoices.filter(
    (choice) => !text || choice.label.toLowerCase().includes(text),
  );
  const groups = ["Flow inputs", "This item", "Earlier steps"] as const;

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

  const noStepFits = options.length === 0 && !text;
  const kindName = kindLabel(kinds[0], input.array);
  const article = /^[aeiou]/i.test(kindName) ? "an" : "a";

  return (
    <Popover
      triggerRef={anchor}
      position="bottom-start"
      gapY={4}
      onClose={onClose}
    >
      <div
        className={menuPanelStyle}
        role="dialog"
        aria-label={`Choose ${input.label}`}
      >
        {hideSearch || query !== undefined ? null : (
          <div className={css({ paddingBottom: "1" })}>
            <TextInput
              value={search}
              onChange={(value) => setSearch(value)}
              placeholder="Search values"
              size="sm"
            />
          </div>
        )}
        {noStepFits ? (
          <div
            className={css({
              padding: "2",
              display: "flex",
              flexDirection: "column",
              gap: "2",
            })}
          >
            <div className={css({ fontSize: "sm", color: "neutral.s110" })}>
              No earlier step gives{" "}
              {kindName === "Any"
                ? "a value that fits"
                : `${article} ${kindName.toLowerCase()}`}
              .
            </div>
            <div
              className={css({ display: "flex", gap: "2", flexWrap: "wrap" })}
            >
              <Button
                size="sm"
                variant="solid"
                iconName="plus"
                onClick={addFlowInput}
              >
                Add flow input
              </Button>
              {onTypeValue ? (
                <Button size="sm" variant="subtle" onClick={onTypeValue}>
                  Type a value
                </Button>
              ) : null}
              {kinds.includes("EntityId") ? (
                <Button
                  size="sm"
                  variant="subtle"
                  iconName="search"
                  onClick={lookUp}
                >
                  Look up in the graph
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {typed.length > 0 ? (
          <div>
            <div className={groupLabelStyle}>
              {kinds.includes("EntityId") ? "Entities" : "Values"}
            </div>
            {typed.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className={rowStyle}
                onClick={() => onPick(choice.source)}
              >
                <IconTile icon="cube" tone="neutral" size="sm" />
                {choice.label}
              </button>
            ))}
          </div>
        ) : null}
        {groups.map((group) => {
          const inGroup = options.filter((option) => option.group === group);
          return inGroup.length === 0 ? null : (
            <div key={group}>
              <div className={groupLabelStyle}>{group}</div>
              {inGroup.map((option) => {
                const look = ownerIcon(document, option);
                return (
                  <button
                    key={JSON.stringify(option.source)}
                    type="button"
                    className={rowStyle}
                    title={`${kindLabel(option.shape.payloadKind, option.shape.array)}${option.note ? ` · ${option.note}` : ""}`}
                    onClick={() => onPick(option.source)}
                  >
                    <IconTile icon={look.icon} tone={look.tone} size="sm" />
                    <span
                      className={css({
                        flex: "1",
                        minWidth: "[0]",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      })}
                    >
                      {group === "Earlier steps"
                        ? `${option.ownerLabel} › ${option.label}`
                        : option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {text && options.length === 0 && typed.length === 0 ? (
          <div
            className={css({
              padding: "2",
              fontSize: "sm",
              color: "neutral.s90",
            })}
          >
            Nothing matches “{query ?? search}”.
          </div>
        ) : null}
        {noStepFits ? null : (
          <div
            className={css({
              marginTop: "2",
              paddingTop: "2",
              borderTopWidth: "thin",
              borderTopStyle: "solid",
              borderTopColor: "neutral.s30",
            })}
          >
            {onTypeValue ? (
              <button type="button" className={rowStyle} onClick={onTypeValue}>
                <IconTile icon="pencil" tone="neutral" size="sm" />
                Type a value
              </button>
            ) : null}
            {kinds.includes("EntityId") ? (
              <button
                type="button"
                className={rowStyle}
                onClick={lookUp}
                title="Adds a Find entities step before this one"
              >
                <IconTile icon="search" tone="green" size="sm" />
                Look up in the graph
              </button>
            ) : null}
            <button type="button" className={rowStyle} onClick={addFlowInput}>
              <IconTile icon="playFilled" tone="neutral" size="sm" />
              Add flow input
            </button>
          </div>
        )}
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
