import { useMemo, useState, useSyncExternalStore } from "react";

import { Button, Form, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { generateFlowTriggersPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";
import { getOutputsAvailableToFlow } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { findStep } from "./shared/find-step";
import { useItemNames } from "./shared/item-name";
import { getOutputLabel } from "./shared/name-label";
import { PanelSection, PanelTitle, SidePanel } from "./shared/side-panel";
import {
  getActionDefinition,
  getStepDisplay,
  startDisplay,
} from "./shared/step-display";
import { StepIconTile } from "./shared/step-icon-tile";
import { getStepPaths } from "./shared/step-paths";
import { indexValueUses } from "./shared/value-uses";
import { ConditionField } from "./step-panel/condition-field";
import { getFieldProblems } from "./step-panel/field-problems";
import { FlowInputCard } from "./step-panel/flow-input-card";
import { InputField } from "./step-panel/input-field";
import { getNewFlowInput } from "./step-panel/input-sources";
import { OutputField } from "./step-panel/output-field";
import { PathsField } from "./step-panel/paths-field";
import { QueryField } from "./step-panel/query-field";
import { TriggersPanelBody } from "./step-panel/triggers-panel";

import type { FlowSchedules } from "./shared/flow-triggers";
import type { StepTone } from "./shared/step-display";
import type { FlowValue, ValueUse } from "./shared/value-uses";
import type { EntityId } from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";
import type { ConnectionTarget } from "@local/hash-isomorphic-utils/flows/can-connect";
import type {
  FlowEditor,
  FlowEditorState,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  InputDefinition,
  PayloadKind,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

type UsesOf = (value: FlowValue) => ValueUse[];

const takesKind = (input: InputDefinition, kind: PayloadKind) =>
  "oneOfPayloadKinds" in input && input.oneOfPayloadKinds.includes(kind);

/** The field for an input: a builder for a query or a condition, otherwise a menu of values. */
const getFieldFor = (input: InputDefinition) =>
  takesKind(input, "EntityQuery")
    ? QueryField
    : takesKind(input, "FilterCondition")
      ? ConditionField
      : InputField;

/** What the panel shows: the flow's triggers, the start step, or one step at any depth. */
export type StepPanelSubject =
  | { triggers: true }
  | { start: true }
  | { stepId: string };

const header = css({ display: "flex", alignItems: "center", gap: "3" });
const headerText = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "0",
});
const headerSubtitle = css({
  display: "flex",
  alignItems: "center",
  textStyle: "sm",
  color: "fg.muted",
});
const headerGroup = css({ flexShrink: "0", whiteSpace: "pre" });
const headerDescription = css({ flex: "1", minWidth: "0" });
/* A for-each's derived name is what the step is called, so it reads as a description would, not as a hint. */
const derivedDescription = css({
  "& input::placeholder": { color: "[inherit]" },
});
const empty = css({ textStyle: "sm", color: "fg.subtle" });
const addInputButton = css({ alignSelf: "flex-start" });
const editTriggersLink = css({ alignSelf: "flex-start" });

/** The step's tile in its hue, then its type, then "Group · description" with the description given as `children`. */
const PanelHeader = ({
  icon,
  tone,
  title,
  group,
  children,
}: {
  icon: IconName;
  tone: StepTone;
  title: string;
  /** Left out for what belongs to no group, such as Start. */
  group?: string;
  children: ReactNode;
}) => (
  <div className={header}>
    <StepIconTile icon={icon} tone={tone} size="header" />
    <div className={headerText}>
      <PanelTitle>{title}</PanelTitle>
      <div className={headerSubtitle}>
        {group !== undefined && (
          <span className={headerGroup}>{`${group} · `}</span>
        )}
        <div className={headerDescription}>{children}</div>
      </div>
    </div>
  </div>
);

/** What "Add input" adds: a required text input, which any step input that takes text can use. */
const newInputTarget: ConnectionTarget = {
  oneOfPayloadKinds: ["Text"],
  array: false,
  required: true,
};

const TriggersPanel = ({
  flowDefinitionEntityId,
  schedules,
}: {
  flowDefinitionEntityId: EntityId;
  schedules: FlowSchedules;
}) => {
  /* The panel is inert under the sheet "Show all" opens, so Tab and Esc stay in the sheet. */
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SidePanel label="Triggers" inert={sheetOpen}>
      <PanelHeader icon="lightning" tone="neutral" title="Triggers">
        What can start this flow
      </PanelHeader>
      <TriggersPanelBody
        schedules={schedules}
        sheetOpen={sheetOpen}
        onSheetOpenChange={setSheetOpen}
      />
      <Button
        variant="subtle"
        tone="neutral"
        size="sm"
        href={generateFlowTriggersPath({ flowDefinitionEntityId })}
        iconName="arrowRight"
        iconPosition="right"
        className={editTriggersLink}
      >
        Edit flow triggers
      </Button>
    </SidePanel>
  );
};

const StartPanel = ({
  editor,
  flowDefinition,
  usesOf,
  onSelectStep,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  usesOf: UsesOf;
  onSelectStep: (stepId: string) => void;
}) => {
  /* The input "Add input" added last, whose label is ready to type in. */
  const [addedName, setAddedName] = useState<string | null>(null);

  /* Names should be unique, but a loaded flow may repeat one (reported as `duplicateInputName`), so a repeat is
   * keyed by how many times its name came before. */
  const timesSeen = new Map<string, number>();
  const inputs = flowDefinition.inputs.map((input) => {
    const repeat = timesSeen.get(input.name) ?? 0;
    timesSeen.set(input.name, repeat + 1);

    return {
      input,
      key: repeat === 0 ? input.name : `${input.name}-${repeat}`,
    };
  });

  const addInput = () => {
    const input = getNewFlowInput({
      flowDefinition,
      inputName: "newInput",
      target: newInputTarget,
    });

    if (input) {
      editor.addFlowInput(input);
      setAddedName(input.name);
    }
  };

  return (
    <SidePanel label="Start">
      <PanelHeader
        icon={startDisplay.icon}
        tone={startDisplay.tone}
        title={startDisplay.title}
      >
        {startDisplay.description}
      </PanelHeader>
      <PanelSection title="Inputs">
        {inputs.length === 0 && <span className={empty}>No inputs yet</span>}
        {inputs.map(({ input, key }) => (
          <FlowInputCard
            key={key}
            editor={editor}
            input={input}
            valueUses={usesOf({ kind: "flow-input", inputName: input.name })}
            autoFocus={input.name === addedName}
            onSelectStep={onSelectStep}
          />
        ))}
        <Button
          variant="subtle"
          size="sm"
          iconName="plus"
          className={addInputButton}
          onClick={addInput}
        >
          Add input
        </Button>
      </PanelSection>
    </SidePanel>
  );
};

const SelectedStepPanel = ({
  editor,
  flowDefinition,
  problemsByStepId,
  usesOf,
  step,
  inner,
  onSelectStart,
  onSelectStep,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  problemsByStepId: FlowEditorState["problemsByStepId"];
  usesOf: UsesOf;
  step: StepDefinition<string>;
  /** Inside a for-each step, so read-only (FE-1915). */
  inner: boolean;
  onSelectStart: () => void;
  onSelectStep: (stepId: string) => void;
}) => {
  const { title, icon, tone, group } = getStepDisplay(step);
  const getItemName = useItemNames(flowDefinition);
  const paths = getStepPaths(step);
  const actionDefinition =
    step.kind === "action"
      ? getActionDefinition(step.actionDefinitionId)
      : undefined;
  const shapes = createStepShapeResolver(flowDefinition);

  /* Which outputs can be flow outputs is checked once per edit, as the editor checks the definition, not per render. */
  const { outputNames, availableToFlow } = useMemo(() => {
    const names =
      step.kind === "for-each"
        ? [step.collect.as]
        : (actionDefinition?.outputs.map(({ name }) => name) ?? []);

    return {
      outputNames: names,
      availableToFlow: getOutputsAvailableToFlow(
        flowDefinition,
        step.stepId,
        names,
      ),
    };
  }, [actionDefinition, flowDefinition, step]);

  const { byInputName, stepProblems } = getFieldProblems(
    problemsByStepId.get(step.stepId) ?? [],
    actionDefinition?.inputs.map(({ name }) => name) ?? [],
  );

  /* A step that branches on its condition, as If does, sets it on the path it's for, not with its inputs. */
  const pathConditionInput = paths.some(({ showsCondition }) => showsCondition)
    ? actionDefinition?.inputs.find((input) =>
        takesKind(input, "FilterCondition"),
      )
    : undefined;

  const renderField = (input: InputDefinition) => {
    if (!actionDefinition) {
      return null;
    }

    const Field = getFieldFor(input);

    return (
      <Field
        key={input.name}
        editor={editor}
        flowDefinition={flowDefinition}
        stepId={step.stepId}
        input={input}
        actionDefinition={actionDefinition}
        source={step.kind === "action" ? step.inputs[input.name] : undefined}
        problems={byInputName.get(input.name) ?? []}
        readOnly={inner}
        onSelectStart={onSelectStart}
      />
    );
  };

  return (
    <SidePanel label={title}>
      <PanelHeader icon={icon} tone={tone} title={title} group={group}>
        <TextInput
          variant="subtle"
          size="sm"
          value={step.description}
          placeholder={
            /* With no description, a for-each is named after its list, as on the canvas. */
            step.kind === "for-each"
              ? `For each ${getItemName(step.stepId)}`
              : "Add a description…"
          }
          className={step.kind === "for-each" ? derivedDescription : undefined}
          aria-label="Description"
          readonly={inner}
          onChange={(description) =>
            editor.setStepDescription(step.stepId, description)
          }
        />
      </PanelHeader>
      {/* Problems with the step as a whole, shown even when it has no inputs, e.g. an action that doesn't exist. */}
      {stepProblems.length > 0 && (
        <Form.Field.Errors
          errors={stepProblems.map(({ message }) => message)}
        />
      )}
      {step.kind === "action" && actionDefinition && (
        <PanelSection title="Inputs">
          <Form.Section>
            {actionDefinition.inputs
              .filter((input) => input !== pathConditionInput)
              .map(renderField)}
          </Form.Section>
        </PanelSection>
      )}
      {paths.length > 0 && (
        <PanelSection title="Paths">
          <PathsField
            editor={editor}
            flowDefinition={flowDefinition}
            step={step}
            paths={paths}
            condition={pathConditionInput && renderField(pathConditionInput)}
            readOnly={inner}
          />
        </PanelSection>
      )}
      {/* TODO(FE-1915): edit a for-each step's list and what it collects */}
      {outputNames.length > 0 && (
        <PanelSection title="Outputs">
          <Form.Section>
            {outputNames.map((outputName) => {
              const marked = flowDefinition.outputs.some(
                (output) =>
                  output.stepId === step.stepId &&
                  output.outputName === outputName,
              );

              return (
                <OutputField
                  key={outputName}
                  name={getOutputLabel(
                    actionDefinition?.actionDefinitionId,
                    outputName,
                  )}
                  shape={shapes.getStepOutputShape(step.stepId, outputName)}
                  valueUses={usesOf({
                    kind: "step-output",
                    stepId: step.stepId,
                    outputName,
                  })}
                  /* One that's marked but isn't available, e.g. inside a for-each step, can still be unmarked. */
                  flowOutput={
                    marked || availableToFlow.includes(outputName)
                      ? {
                          marked,
                          onToggle: () =>
                            marked
                              ? editor.unmarkFlowOutput(step.stepId, outputName)
                              : editor.markFlowOutput(step.stepId, outputName),
                        }
                      : undefined
                  }
                  onSelectStep={onSelectStep}
                />
              );
            })}
          </Form.Section>
        </PanelSection>
      )}
    </SidePanel>
  );
};

/** The panel beside the canvas for the selected step: its description, the values it takes and those it gives. */
export const StepPanel = ({
  editor,
  flowDefinitionEntityId,
  subject,
  schedules,
  onSelectStart,
  onSelectStep,
}: {
  editor: FlowEditor;
  flowDefinitionEntityId: EntityId;
  subject: StepPanelSubject;
  schedules: FlowSchedules;
  onSelectStart: () => void;
  /** Selects a step that uses a value, picked from "Used in". */
  onSelectStep: (stepId: string) => void;
}) => {
  const { flowDefinition, problemsByStepId } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );
  const usesOf = useMemo(
    () => indexValueUses(flowDefinition.steps),
    [flowDefinition.steps],
  );

  if ("triggers" in subject) {
    return (
      <TriggersPanel
        flowDefinitionEntityId={flowDefinitionEntityId}
        schedules={schedules}
      />
    );
  }

  if ("start" in subject) {
    return (
      <StartPanel
        editor={editor}
        flowDefinition={flowDefinition}
        usesOf={usesOf}
        onSelectStep={onSelectStep}
      />
    );
  }

  const found = findStep(flowDefinition.steps, subject.stepId);

  return found ? (
    <SelectedStepPanel
      /* Each step's fields start afresh, e.g. not mid-way through typing a value. */
      key={subject.stepId}
      editor={editor}
      flowDefinition={flowDefinition}
      problemsByStepId={problemsByStepId}
      usesOf={usesOf}
      step={found.step}
      inner={found.inner}
      onSelectStart={onSelectStart}
      onSelectStep={onSelectStep}
    />
  ) : null;
};
