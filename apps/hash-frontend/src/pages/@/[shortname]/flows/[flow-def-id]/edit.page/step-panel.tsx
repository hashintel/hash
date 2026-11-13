import { useMemo, useState, useSyncExternalStore } from "react";

import { Button, Form, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";
import { getOutputsAvailableToFlow } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { findStep } from "./shared/find-step";
import { getOutputLabel } from "./shared/name-label";
import { PanelSection, PanelTitle, SidePanel } from "./shared/side-panel";
import {
  getActionDefinition,
  getStepDisplay,
  startDisplay,
} from "./shared/step-display";
import { StepIconTile } from "./shared/step-icon-tile";
import { indexValueUses } from "./shared/value-uses";
import { getFieldProblems } from "./step-panel/field-problems";
import { FlowInputCard } from "./step-panel/flow-input-card";
import { InputField } from "./step-panel/input-field";
import { getNewFlowInput } from "./step-panel/input-sources";
import { QueryField } from "./step-panel/query-field";
import { UsedByField } from "./step-panel/used-by-field";

import type { StepTone } from "./shared/step-display";
import type { FlowValue } from "./shared/value-uses";
import type { IconName } from "@hashintel/ds-components";
import type { ConnectionTarget } from "@local/hash-isomorphic-utils/flows/can-connect";
import type {
  FlowEditor,
  FlowEditorState,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  InputDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

type StepsUsing = (value: FlowValue) => StepDefinition<string>[];

const takesEntityQuery = (input: InputDefinition) =>
  "oneOfPayloadKinds" in input &&
  input.oneOfPayloadKinds.includes("EntityQuery");

/** What the panel shows: the start step, or one step at any depth. */
export type StepPanelSubject = { start: true } | { stepId: string };

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
const empty = css({ textStyle: "sm", color: "fg.subtle" });
const addInputButton = css({ alignSelf: "flex-start" });

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
  group: string | undefined;
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
        <span className={headerDescription}>{children}</span>
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

const StartPanel = ({
  editor,
  flowDefinition,
  stepsUsing,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  stepsUsing: StepsUsing;
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
        group={undefined}
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
            usedBy={stepsUsing({ kind: "flow-input", inputName: input.name })}
            autoFocus={input.name === addedName}
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
  stepsUsing,
  step,
  inner,
  onSelectStart,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  problemsByStepId: FlowEditorState["problemsByStepId"];
  stepsUsing: StepsUsing;
  step: StepDefinition<string>;
  /** Inside a for-each step, so read-only (FE-1915). */
  inner: boolean;
  onSelectStart: () => void;
}) => {
  const { title, icon, tone, group } = getStepDisplay(step);
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

  return (
    <SidePanel label={title}>
      <PanelHeader icon={icon} tone={tone} title={title} group={group}>
        <TextInput
          variant="subtle"
          size="sm"
          value={step.description}
          placeholder="Add a description…"
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
            {actionDefinition.inputs.map((input) => {
              const Field = takesEntityQuery(input) ? QueryField : InputField;

              return (
                <Field
                  key={input.name}
                  editor={editor}
                  flowDefinition={flowDefinition}
                  stepId={step.stepId}
                  input={input}
                  actionDefinition={actionDefinition}
                  source={step.inputs[input.name]}
                  problems={byInputName.get(input.name) ?? []}
                  readOnly={inner}
                  onSelectStart={onSelectStart}
                />
              );
            })}
          </Form.Section>
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
                <UsedByField
                  key={outputName}
                  name={getOutputLabel(
                    actionDefinition?.actionDefinitionId,
                    outputName,
                  )}
                  shape={shapes.getStepOutputShape(step.stepId, outputName)}
                  usedBy={stepsUsing({
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
  subject,
  onSelectStart,
}: {
  editor: FlowEditor;
  subject: StepPanelSubject;
  onSelectStart: () => void;
}) => {
  const { flowDefinition, problemsByStepId } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );
  const stepsUsing = useMemo<StepsUsing>(() => {
    const usesOf = indexValueUses(flowDefinition.steps);

    return (value) => usesOf(value).map(({ step }) => step);
  }, [flowDefinition.steps]);

  if ("start" in subject) {
    return (
      <StartPanel
        editor={editor}
        flowDefinition={flowDefinition}
        stepsUsing={stepsUsing}
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
      stepsUsing={stepsUsing}
      step={found.step}
      inner={found.inner}
      onSelectStart={onSelectStart}
    />
  ) : null;
};
