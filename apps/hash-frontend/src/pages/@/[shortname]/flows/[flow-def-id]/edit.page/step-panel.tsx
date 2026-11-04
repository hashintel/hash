import { useMemo, useSyncExternalStore } from "react";

import { Form, Icon, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { getStepDisplay, startDisplay } from "./shared/step-display";
import { getFieldProblems } from "./step-panel/field-problems";
import { InputField } from "./step-panel/input-field";
import { getActionDefinition } from "./step-panel/input-sources";
import { findStep } from "./step-panel/shared/find-step";
import { getNameLabel } from "./step-panel/shared/value-display";
import { UsedByField } from "./step-panel/used-by-field";
import { indexValueUses } from "./step-panel/value-uses";

import type { IconName } from "@hashintel/ds-components";
import type {
  FlowEditor,
  FlowEditorState,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

type StepsUsing = ReturnType<typeof indexValueUses>;

/** What the panel shows: the start step, or one step at any depth. */
export type StepPanelSubject = { start: true } | { stepId: string };

/** The panel floats over the canvas's right edge, so opening it doesn't resize the canvas or move what's on it. */
export const stepPanelWidth = 384;

const panel = css({
  position: "absolute",
  zIndex: "docked",
  top: "0",
  right: "0",
  bottom: "0",
  display: "flex",
  flexDirection: "column",
  gap: "8",
  width: "[384px]",
  p: "4",
  bg: "bgSolid.min",
  overflowY: "auto",
  borderLeftWidth: "1px",
  borderLeftStyle: "solid",
  borderLeftColor: "bd.subtle",
});
const header = css({ display: "flex", alignItems: "flex-start", gap: "2" });
const headerIcon = css({ display: "flex", color: "fg.body", pt: "0.5" });
const headerText = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flex: "1",
  minWidth: "0",
});
const heading = css({
  m: "0",
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const fixedDescription = css({ textStyle: "sm", color: "fg.body" });
const section = css({ display: "flex", flexDirection: "column", gap: "2" });
const empty = css({ textStyle: "sm", color: "fg.subtle" });

const PanelHeader = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) => (
  <div className={header}>
    <span className={headerIcon}>
      <Icon name={icon} size="sm" />
    </span>
    <div className={headerText}>
      <h2 className={heading}>{title}</h2>
      {children}
    </div>
  </div>
);

const PanelSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className={section}>
    <h3 className={heading}>{title}</h3>
    {children}
  </section>
);

const StartPanel = ({
  flowDefinition,
  stepsUsing,
}: {
  flowDefinition: FlowDefinition<string>;
  stepsUsing: StepsUsing;
}) => {
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

  return (
    <aside className={panel} aria-label="Start">
      <PanelHeader icon={startDisplay.icon} title={startDisplay.title}>
        <span className={fixedDescription}>{startDisplay.description}</span>
      </PanelHeader>
      <PanelSection title="Inputs">
        {inputs.length === 0 ? (
          <span className={empty}>No inputs yet</span>
        ) : (
          <Form.Section>
            {inputs.map(
              ({ input: { name, label, payloadKind, array }, key }) => (
                <UsedByField
                  key={key}
                  name={label ?? getNameLabel(name)}
                  shape={{ payloadKind, array }}
                  usedBy={stepsUsing({ kind: "flow-input", inputName: name })}
                />
              ),
            )}
          </Form.Section>
        )}
      </PanelSection>
    </aside>
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
  const { title, icon } = getStepDisplay(step);
  const actionDefinition =
    step.kind === "action"
      ? getActionDefinition(step.actionDefinitionId)
      : undefined;
  const shapes = createStepShapeResolver(flowDefinition);

  const outputNames =
    step.kind === "for-each"
      ? [step.collect.as]
      : (actionDefinition?.outputs.map(({ name }) => name) ?? []);

  const { byInputName, stepProblems } = getFieldProblems(
    problemsByStepId.get(step.stepId) ?? [],
    actionDefinition?.inputs.map(({ name }) => name) ?? [],
  );

  return (
    <aside className={panel} aria-label={title}>
      <PanelHeader icon={icon} title={title}>
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
      {step.kind === "action" && actionDefinition && (
        <PanelSection title="Inputs">
          {stepProblems.length > 0 && (
            <Form.Field.Errors
              errors={stepProblems.map(({ message }) => message)}
            />
          )}
          <Form.Section>
            {actionDefinition.inputs.map((input) => (
              <InputField
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
            ))}
          </Form.Section>
        </PanelSection>
      )}
      {/* TODO(FE-1915): edit a for-each step's list and what it collects */}
      {outputNames.length > 0 && (
        <PanelSection title="Outputs">
          <Form.Section>
            {outputNames.map((outputName) => (
              <UsedByField
                key={outputName}
                name={getNameLabel(outputName)}
                shape={shapes.getStepOutputShape(step.stepId, outputName)}
                usedBy={stepsUsing({
                  kind: "step-output",
                  stepId: step.stepId,
                  outputName,
                })}
              />
            ))}
          </Form.Section>
        </PanelSection>
      )}
    </aside>
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
  const stepsUsing = useMemo(
    () => indexValueUses(flowDefinition.steps),
    [flowDefinition.steps],
  );

  if ("start" in subject) {
    return (
      <StartPanel flowDefinition={flowDefinition} stepsUsing={stepsUsing} />
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
