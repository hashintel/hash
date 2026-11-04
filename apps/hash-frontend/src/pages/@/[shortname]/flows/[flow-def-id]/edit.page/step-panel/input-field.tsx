import { useState } from "react";

import {
  Button,
  Chip,
  Form,
  Icon,
  Menu,
  SelectableListSearch,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  getInputTarget,
  getNewFlowInput,
  getSourceKey,
  getSourceLabel,
  getSourceOptions,
  getTypedConstant,
  getTypedKind,
} from "./input-sources";
import {
  getKindIcon,
  getKindLabel,
  getNameLabel,
  withArticle,
} from "./shared/value-display";

import type { SourceOption } from "./input-sources";
import type { MenuItem, ItemOrGroup } from "@hashintel/ds-components";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  FlowDefinition,
  InputDefinition,
  PayloadKind,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowDefinitionDiagnosticCode,
  FlowDefinitionDiagnosticWithStepId,
} from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

/** Problems with a value whose source no longer exists. */
const goneSourceCodes = new Set<FlowDefinitionDiagnosticCode>([
  "unknownStep",
  "unknownFlowInput",
  "unknownStepOutput",
]);

/** Problems with where a value comes from, shown as a red chip in place of the value. */
const brokenSourceCodes = new Set<FlowDefinitionDiagnosticCode>([
  ...goneSourceCodes,
  "stepNotInScope",
  "selfReference",
  "itemOutsideForEach",
]);

/** Values shown before Show more. */
const shownOptionCount = 4;

/* The Button only fills the row; what's inside it is laid out by these. */
const trigger = css({ width: "full" });
const triggerContent = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
});
const triggerValue = css({
  flex: "1",
  minWidth: "0",
  truncate: true,
  textAlign: "left",
});
const placeholder = css({ color: "fg.muted" });

const matchesQuery = ({ label, from }: SourceOption, query: string) => {
  const text = `${label} ${from}`.toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
};

/**
 * Picks where an input's value comes from: a flow input, an earlier step's output, or a value typed in. Shows the
 * picked value, or a red chip saying why it's broken.
 */
const SourceMenu = ({
  label,
  options,
  pickedKey,
  pickedLabel,
  brokenReason,
  invalid,
  disabled,
  newFlowInputLabel,
  typeLabel,
  onPick,
  onAddFlowInput,
  onType,
  onClear,
}: {
  label: string;
  /** Flow inputs, then the outputs of earlier steps, nearest first. */
  options: SourceOption[];
  pickedKey: string | undefined;
  pickedLabel: string | undefined;
  brokenReason: string | undefined;
  invalid: boolean;
  disabled: boolean;
  /** Offered only when no value fits. */
  newFlowInputLabel: string | null;
  typeLabel: string | null;
  onPick: (option: SourceOption) => void;
  onAddFlowInput: () => void;
  onType: () => void;
  onClear: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const matching = options.filter((option) => matchesQuery(option, query));
  const shown =
    showAll || query !== "" ? matching : matching.slice(0, shownOptionCount);

  const earlierStepItems: MenuItem[] = [
    ...shown.map((option): MenuItem => ({
      id: getSourceKey(option.source),
      text: option.label,
      description: option.from,
      icon: getKindIcon(option.shape),
      selected: getSourceKey(option.source) === pickedKey,
      onClick: () => onPick(option),
    })),
    ...(shown.length < matching.length
      ? [
          {
            id: "show-more",
            text: "Show more",
            icon: "chevronDown",
            keepOpenOnSelect: true,
            onClick: () => setShowAll(true),
          } satisfies MenuItem,
        ]
      : []),
    ...(options.length > 0 && matching.length === 0
      ? [
          {
            id: "no-matches",
            text: "No matching values",
            disabled: true,
            onClick: () => {},
          } satisfies MenuItem,
        ]
      : []),
    ...(options.length === 0 && newFlowInputLabel !== null
      ? [
          {
            id: "add-flow-input",
            text: newFlowInputLabel,
            icon: "plus",
            onClick: onAddFlowInput,
          } satisfies MenuItem,
        ]
      : []),
  ];

  const items: ItemOrGroup<MenuItem>[] = [
    ...(earlierStepItems.length > 0
      ? [
          {
            id: "earlier-steps",
            label: "Earlier steps",
            items: earlierStepItems,
          },
        ]
      : []),
    ...(typeLabel !== null
      ? [
          {
            id: "type-a-value",
            text: typeLabel,
            icon: "pencil",
            onClick: onType,
          } satisfies MenuItem,
        ]
      : []),
    ...(pickedKey !== undefined
      ? [
          {
            id: "clear-value",
            text: "Clear value",
            icon: "close",
            onClick: onClear,
          } satisfies MenuItem,
        ]
      : []),
  ];

  const value =
    brokenReason !== undefined && pickedLabel !== undefined ? (
      <Tooltip position="top" content={brokenReason}>
        <Chip size="md" color="red">
          {pickedLabel}
        </Chip>
      </Tooltip>
    ) : (
      <span className={pickedLabel === undefined ? placeholder : undefined}>
        {pickedLabel ?? "Choose a value"}
      </span>
    );

  return (
    <Menu
      items={items}
      header={
        <SelectableListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search values"
          aria-label="Search values"
        />
      }
      onOpen={(open) => {
        if (!open) {
          setQuery("");
          setShowAll(false);
        }
      }}
      trigger={
        <Button
          variant="subtle"
          tone={invalid ? "error" : "neutral"}
          disabled={disabled}
          aria-label={`${label}: ${pickedLabel ?? "no value"}`}
          className={trigger}
        >
          <span className={triggerContent}>
            <span className={triggerValue}>{value}</span>
            <Icon name="chevronDown" size="sm" />
          </span>
        </Button>
      }
    />
  );
};

/**
 * A step input's field: a menu to pick its value, or a text field once a value is typed. Its problems show beneath
 * it; a value whose source is gone shows as a red chip.
 */
export const InputField = ({
  editor,
  flowDefinition,
  stepId,
  input,
  actionDefinition,
  source,
  problems,
  readOnly,
  onSelectStart,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  input: InputDefinition;
  actionDefinition: ActionDefinition<FlowActionDefinitionId>;
  source: StepInputSource | undefined;
  problems: FlowDefinitionDiagnosticWithStepId[];
  /** For steps inside a for-each step, which can't be edited yet. */
  readOnly: boolean;
  onSelectStart: () => void;
}) => {
  /* Set from picking Type a value until the field is left with nothing typed. */
  const [typing, setTyping] = useState(false);

  const label = getNameLabel(input.name);
  const target = getInputTarget({
    flowDefinition,
    stepId,
    input,
    actionDefinition,
  });
  const typedKind = getTypedKind(target);
  const typedConstant = getTypedConstant(source);

  const brokenProblem = problems.find(({ code }) =>
    brokenSourceCodes.has(code),
  );
  const errors = problems
    .filter((problem) => problem !== brokenProblem)
    .map(({ code, message }) =>
      code === "missingInput" ? "Required" : message,
    );

  const setSource = (next: StepInputSource | null) =>
    editor.setInputSource(stepId, input.name, next);

  const typedInKind: PayloadKind | null =
    typedConstant?.kind ?? (typing ? typedKind : null);

  if (typedInKind !== null) {
    return (
      <Form.Field
        layout="inline"
        label={label}
        errors={errors.length > 0 ? errors : undefined}
      >
        <TextInput
          type={
            typedInKind === "Number"
              ? "number"
              : typedInKind === "Date"
                ? "date"
                : "text"
          }
          value={typedConstant?.text ?? ""}
          readonly={readOnly}
          invalid={errors.length > 0}
          autoFocus={typing}
          clearable={
            !readOnly && {
              onClear: () => {
                setTyping(false);
                setSource(null);
              },
            }
          }
          onChange={(text) =>
            setSource(
              text === ""
                ? null
                : {
                    kind: "constant",
                    payload: {
                      kind: typedInKind,
                      value: typedInKind === "Number" ? Number(text) : text,
                    },
                  },
            )
          }
          onBlur={() => setTyping(false)}
        />
      </Form.Field>
    );
  }

  const { flowInputs, earlierSteps } = readOnly
    ? { flowInputs: [], earlierSteps: [] }
    : getSourceOptions({ flowDefinition, stepId, target });
  const pickedLabel = source && getSourceLabel(flowDefinition, source);
  const newFlowInput = getNewFlowInput({
    flowDefinition,
    inputName: input.name,
    target,
  });

  return (
    <Form.Field
      layout="inline"
      label={label}
      errors={errors.length > 0 ? errors : undefined}
    >
      <SourceMenu
        label={label}
        options={[...flowInputs, ...earlierSteps]}
        pickedKey={source && getSourceKey(source)}
        pickedLabel={pickedLabel}
        brokenReason={
          brokenProblem &&
          (goneSourceCodes.has(brokenProblem.code)
            ? `${pickedLabel} no longer exists`
            : brokenProblem.message)
        }
        invalid={errors.length > 0}
        disabled={readOnly}
        newFlowInputLabel={
          newFlowInput &&
          `Add ${withArticle(getKindLabel(newFlowInput))} input on Start`
        }
        typeLabel={
          typedKind &&
          (typedKind === "Text"
            ? "Type a value"
            : `Type ${withArticle(getKindLabel({ payloadKind: typedKind, array: false }))}`)
        }
        onPick={(option) => setSource(option.source)}
        onAddFlowInput={() => {
          if (!newFlowInput) {
            return;
          }

          editor.addFlowInput(newFlowInput);
          setSource({ kind: "flow-input", inputName: newFlowInput.name });
          onSelectStart();
        }}
        onType={() => setTyping(true)}
        onClear={() => setSource(null)}
      />
    </Form.Field>
  );
};
