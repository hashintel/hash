import { Form, Select } from "@hashintel/ds-components";
import { allPayloadKinds } from "@local/hash-isomorphic-utils/flows/types";

import { getStepName } from "../shared/find-step";
import { getOutputLabel } from "../shared/name-label";
import { getActionDefinition } from "../shared/step-display";
import { SourceMenu } from "./input-field";
import {
  brokenSourceCodes,
  getSourceKey,
  getSourceLabel,
  getSourceOptions,
  goneSourceCodes,
} from "./input-sources";

import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  ForEachStepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowDefinitionDiagnosticCode,
  FlowDefinitionDiagnosticWithStepId,
} from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

type Problem = FlowDefinitionDiagnosticWithStepId;

/** Said in the field itself, by its placeholder, so under it only "Required" is shown. */
const missingCodes = new Set<FlowDefinitionDiagnosticCode>([
  "missingOver",
  "missingCollect",
]);

const getErrors = (problems: Problem[]) =>
  problems.map(({ code, message }) =>
    missingCodes.has(code) ? "Required" : message,
  );

/** A list of any kind, which a for-each step runs its steps once per item of. */
const listTarget = {
  oneOfPayloadKinds: allPayloadKinds,
  array: true,
  required: true,
};

/** A for-each step's list: a list from Start or an earlier step. */
export const ListField = ({
  editor,
  flowDefinition,
  step,
  problems,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  step: ForEachStepDefinition<string>;
  problems: Problem[];
}) => {
  const { flowInputs, earlierSteps } = getSourceOptions({
    flowDefinition,
    stepId: step.stepId,
    target: listTarget,
    /* A for-each step is never inside another, so has no item to offer. */
    getItemName: () => "item",
  });
  const brokenProblem = problems.find(({ code }) =>
    brokenSourceCodes.has(code),
  );
  const errors = getErrors(
    problems.filter((problem) => problem !== brokenProblem),
  );
  const pickedLabel =
    step.over && getSourceLabel(flowDefinition, step.over, undefined);

  return (
    <Form.Field
      layout="inline"
      label="List"
      errors={errors.length > 0 ? errors : undefined}
    >
      <SourceMenu
        label="List"
        placeholder="Choose a list"
        options={[...flowInputs, ...earlierSteps]}
        pickedKey={step.over && getSourceKey(step.over)}
        pickedLabel={pickedLabel}
        brokenReason={
          brokenProblem &&
          (goneSourceCodes.has(brokenProblem.code)
            ? `${pickedLabel} no longer exists`
            : brokenProblem.message)
        }
        invalid={errors.length > 0}
        newFlowInputLabel={null}
        typeLabel={null}
        onPick={(option) => editor.setForEachList(step.stepId, option.source)}
        onAddFlowInput={() => {}}
        onType={() => {}}
        onClear={() => editor.setForEachList(step.stepId, null)}
      />
    </Form.Field>
  );
};

const getCollectKey = ({
  stepId,
  outputName,
}: {
  stepId: string;
  outputName: string;
}) => JSON.stringify([stepId, outputName]);

/** What a for-each step collects from every item: an output of a step inside it that's always present. */
export const CollectField = ({
  editor,
  step,
  problems,
}: {
  editor: FlowEditor;
  step: ForEachStepDefinition<string>;
  problems: Problem[];
}) => {
  const options = step.steps.flatMap((inner) => {
    if (inner.kind !== "action") {
      return [];
    }

    const outputs = (
      getActionDefinition(inner.actionDefinitionId)?.outputs ?? []
    ).filter(({ required }) => required);

    return outputs.length > 0
      ? [
          {
            id: inner.stepId,
            label: getStepName(inner),
            items: outputs.map(({ name }) => ({
              value: getCollectKey({ stepId: inner.stepId, outputName: name }),
              text: getOutputLabel(inner.actionDefinitionId, name),
            })),
          },
        ]
      : [];
  });
  const labelsByKey = new Map(
    options.flatMap(({ label, items }) =>
      items.map(({ value, text }) => [value, `${label} › ${text}`] as const),
    ),
  );
  const errors = getErrors(problems);

  return (
    <Form.Field
      layout="inline"
      label="Collect"
      errors={errors.length > 0 ? errors : undefined}
    >
      <Select<string>
        items={options}
        value={step.collect ? getCollectKey(step.collect) : null}
        placeholder={
          options.length === 0 ? "Add a step inside first" : "Choose an output"
        }
        disabled={options.length === 0}
        renderSelectedItem={(key) => labelsByKey.get(key) ?? key}
        onChange={(key) => {
          const [stepId, outputName] = key
            ? (JSON.parse(key) as [string, string])
            : [];

          editor.setForEachCollect(
            step.stepId,
            stepId !== undefined && outputName !== undefined
              ? { stepId, outputName }
              : null,
          );
        }}
      />
    </Form.Field>
  );
};
