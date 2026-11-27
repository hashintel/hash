import { useRef, useState } from "react";

import {
  Button,
  Chip,
  Form,
  Icon,
  Menu,
  NumberInput,
  SelectableListSearch,
  TextArea,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getInputSize } from "@local/hash-isomorphic-utils/flows/input-size";

import { getForEachScope, useItemNames } from "../shared/item-name";
import { getNameLabel } from "../shared/name-label";
import {
  getKindIcon,
  getKindLabel,
  withArticle,
} from "../shared/value-display";
import {
  brokenSourceCodes,
  getInputTarget,
  getNewFlowInput,
  getSourceKey,
  getSourceLabel,
  getSourceOptions,
  getTypedConstant,
  getTypedKind,
  goneSourceCodes,
} from "./input-sources";

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
import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import type { FocusEvent } from "react";

/** Values shown before Show more. */
const shownOptionCount = 4;

/** Rows of a medium text beside its label, and of a long or expanded one, which then grows with its text. */
const besideLabelRows = 2;
const ownLineRows = 6;

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
/* A value's step and name share its row's line: the Menu's `description` would put the name on a second one. */
const optionText = css({ display: "flex", minWidth: "0" });
const optionStep = css({ minWidth: "0", truncate: true });
const optionValue = css({
  flexShrink: "0",
  color: "fg.subtle",
  whiteSpace: "nowrap",
});
const optionSeparator = css({ px: "1.5" });

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
export const SourceMenu = ({
  label,
  placeholder: placeholderText = "Choose a value",
  options,
  pickedKey,
  pickedLabel,
  brokenReason,
  invalid,
  newFlowInputLabel,
  typeLabel,
  onPick,
  onAddFlowInput,
  onType,
  onClear,
}: {
  label: string;
  /** Shown while nothing is picked. */
  placeholder?: string;
  /** The current item inside a for-each step, flow inputs, then the outputs of earlier steps, nearest first. */
  options: SourceOption[];
  pickedKey: string | undefined;
  pickedLabel: string | undefined;
  brokenReason: string | undefined;
  invalid: boolean;
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
    /* Step first, as a large flow can have many values of one name, such as "email". */
    ...shown.map((option): MenuItem => ({
      id: getSourceKey(option.source),
      text: (
        <span className={optionText}>
          <span className={optionStep}>{option.from}</span>
          <span className={optionValue}>
            <span className={optionSeparator}>›</span>
            {option.label}
          </span>
        </span>
      ),
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
    ...(matching.length === 0 &&
    (options.length > 0 || (newFlowInputLabel === null && typeLabel === null))
      ? [
          {
            id: "no-matches",
            text:
              options.length > 0 ? "No matching values" : "No values to pick",
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
        {pickedLabel ?? placeholderText}
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
 * A step input's field: a menu to pick its value, or a text field once a value is typed, sized by the input (see
 * `getInputSize`). Its problems show beneath it; a value whose source is gone shows as a red chip.
 */
export const InputField = ({
  editor,
  flowDefinition,
  stepId,
  input,
  actionDefinition,
  source,
  problems,
  onSelectStart,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  stepId: string;
  input: InputDefinition;
  actionDefinition: ActionDefinition<FlowActionDefinitionId>;
  source: StepInputSource | undefined;
  problems: FlowDefinitionDiagnosticWithStepId[];
  onSelectStart: () => void;
}) => {
  /* Set from picking Type a value until the field is left with nothing typed. */
  const [typing, setTyping] = useState(false);
  /* Whether a medium text has been given a line of its own. */
  const [expanded, setExpanded] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const getItemName = useItemNames(flowDefinition);

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
    /* Typing keeps the field until it's left, even while what's typed isn't a value yet, such as "-". */
    const setTypedValue = (value: string | number | null) => {
      setTyping(true);
      setSource(
        value === null || value === ""
          ? null
          : { kind: "constant", payload: { kind: typedInKind, value } },
      );
    };
    const fieldProps = {
      invalid: errors.length > 0,
      autoFocus: typing,
      /* Moving between a text and its Expand button doesn't leave the field. */
      onBlur: ({ relatedTarget }: FocusEvent) => {
        const staysInField =
          relatedTarget !== null &&
          (relatedTarget === textArea.current ||
            relatedTarget === expandButton.current);

        if (!staysInField) {
          setTyping(false);
        }
      },
    };
    const clearable = {
      onClear: () => {
        setTyping(false);
        setSource(null);
      },
    };

    /* Text of a few lines or more is typed in a text area, on a line of its own when it's long or expanded. */
    const size = getInputSize(input);
    const ownLine = size === "long" || (size === "medium" && expanded);

    return (
      <Form.Field
        layout={ownLine ? "block" : "inline"}
        label={label}
        errors={errors.length > 0 ? errors : undefined}
        labelActions={
          size === "medium" && (
            <Button
              ref={expandButton}
              variant="ghost"
              size="xs"
              iconName={expanded ? "collapse" : "expand"}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
              tooltip={expanded ? "Collapse" : "Expand"}
              /* A click leaves focus in the text, as Safari doesn't move it to a clicked button. */
              onMouseDown={(event) => event.preventDefault()}
              onBlur={fieldProps.onBlur}
              /* The text is laid out anew, so it takes focus back once it is. */
              onClick={() => {
                setExpanded(!expanded);
                setTyping(true);
              }}
            />
          )
        }
      >
        {/*
         * Widths are Salt's presets. A number takes the narrowest, as steps take counts of a few digits. Text keeps the
         * full width, as the menu it replaces had: the panel's column is narrower than Salt's other presets anyway.
         */}
        {typedInKind === "Number" ? (
          <NumberInput
            {...fieldProps}
            width="xs"
            clearable={clearable}
            value={typedConstant ? Number(typedConstant.text) : null}
            min={-Number.MAX_VALUE}
            max={Number.MAX_VALUE}
            step="any"
            onChange={setTypedValue}
          />
        ) : size === "short" ? (
          <TextInput
            {...fieldProps}
            clearable={clearable}
            type={typedInKind === "Date" ? "date" : "text"}
            value={typedConstant?.text ?? ""}
            onChange={setTypedValue}
          />
        ) : (
          <TextArea
            {...fieldProps}
            inputRef={textArea}
            rows={ownLine ? ownLineRows : besideLabelRows}
            autoResize={ownLine}
            value={typedConstant?.text ?? ""}
            onChange={setTypedValue}
          />
        )}
      </Form.Field>
    );
  }

  const { item, flowInputs, earlierSteps } = getSourceOptions({
    flowDefinition,
    stepId,
    target,
    getItemName,
  });
  const forEachStepId = getForEachScope(flowDefinition.steps, stepId)?.at(-1);
  const pickedLabel =
    source &&
    getSourceLabel(
      flowDefinition,
      source,
      forEachStepId
        ? { stepId: forEachStepId, itemName: getItemName(forEachStepId) }
        : undefined,
    );
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
        options={[...(item ? [item] : []), ...flowInputs, ...earlierSteps]}
        pickedKey={source && getSourceKey(source)}
        pickedLabel={pickedLabel}
        brokenReason={
          brokenProblem &&
          (goneSourceCodes.has(brokenProblem.code)
            ? `${pickedLabel} no longer exists`
            : brokenProblem.message)
        }
        invalid={errors.length > 0}
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
