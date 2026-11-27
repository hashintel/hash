import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import * as browserPluginFlows from "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions";
import * as fileFlows from "@local/hash-isomorphic-utils/flows/definitions/file-flow-definitions";
import * as frontendFlows from "@local/hash-isomorphic-utils/flows/definitions/frontend-flow-definitions";
import { ftseInvestorsFlow } from "@local/hash-isomorphic-utils/flows/definitions/ftse-investors-flow-definition";
import * as goalFlows from "@local/hash-isomorphic-utils/flows/definitions/goal-flow-definitions";
import * as integrationFlows from "@local/hash-isomorphic-utils/flows/definitions/integration-flow-definitions";

import type {
  ActionStepDefinition,
  FlowDefinition,
  FlowDefinitionWithId,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const isFlow = (value: unknown): value is FlowDefinitionWithId =>
  typeof value === "object" &&
  value !== null &&
  "flowDefinitionId" in value &&
  "flowDefinition" in value;

/** Every hardcoded flow's definition, found among the flow modules' exports so that new flows are covered too. */
export const hardcodedFlowDefinitions = Object.entries({
  ...browserPluginFlows,
  ...fileFlows,
  ...frontendFlows,
  ...goalFlows,
  ...integrationFlows,
  ftseInvestorsFlow,
}).flatMap(([name, value]: [string, unknown]) =>
  isFlow(value) ? [[name, value.flowDefinition] as const] : [],
);

/** One step, `get`, that gets a file from the flow's `url`. */
export const fileFlowDefinition = defineFlow(
  {
    flowDefinitionId: "get-file",
    name: "Get file",
    description: "Get a file from a URL",
    inputs: { url: flowInput("Text") },
  },
  ({ inputs, step }) => {
    const getFile = step("get", actions.getFileFromUrl, {
      description: "Retrieve the file from the URL",
      inputs: { url: inputs.url },
    });

    return { outputs: { file: getFile.outputs.fileEntity } };
  },
).flowDefinition;

/** A `forEach` step, `each`, over the flow's `urls`, whose `get` step gets each file, collected as `files`. */
export const forEachFlowDefinition = defineFlow(
  {
    flowDefinitionId: "get-files",
    name: "Get files",
    description: "Get a file from each URL",
    inputs: { urls: flowInput("Text", { array: true }) },
  },
  ({ inputs, forEach }) => {
    const files = forEach("each", inputs.urls, {
      description: "Retrieve each file",
      collectAs: "files",
      steps: (url, scope) =>
        scope.step("get", actions.getFileFromUrl, {
          description: "Retrieve the file",
          inputs: { url },
        }).outputs.fileEntity,
    });

    return { outputs: { files } };
  },
).flowDefinition;

/**
 * A `research` step whose `proposedEntities` `persist` consumes and `review` reads, so they get a copy and a shared
 * place, and a `forEach` step, `each`, over the flow's `urls`, which collects each `get`.
 */
export const sharedOutputFlowDefinition = defineFlow(
  {
    flowDefinitionId: "research-and-get-files",
    name: "Research and get files",
    description: "Persist and review research, then get a file from each URL",
    inputs: {
      prompt: flowInput("Text"),
      urls: flowInput("Text", { array: true }),
    },
  },
  ({ inputs, step, forEach }) => {
    const research = step("research", actions.researchEntities, {
      description: "Research the prompt",
      inputs: { prompt: inputs.prompt },
    });
    step("persist", actions.persistEntities, {
      description: "Persist what the research found",
      inputs: { proposedEntities: research.outputs.proposedEntities.consume() },
    });

    step("review", actions.persistEntities, {
      description: "Persist the same as drafts",
      inputs: { proposedEntities: research.outputs.proposedEntities.read() },
    });

    const files = forEach("each", inputs.urls, {
      description: "Retrieve each file",
      collectAs: "files",
      steps: (url, scope) =>
        scope.step("get", actions.getFileFromUrl, {
          description: "Retrieve the file",
          inputs: { url },
        }).outputs.fileEntity,
    });

    return { outputs: { files } };
  },
).flowDefinition;

const getFileStep = (
  stepId: string,
  runAfter: StepDefinition["runAfter"],
  url: ActionStepDefinition["inputs"][string] = {
    kind: "flow-input",
    inputName: "url",
  },
): ActionStepDefinition => ({
  kind: "action",
  stepId,
  actionDefinitionId: "getFileFromUrl",
  description: "",
  inputs: { url },
  runAfter,
});

const ifStep = (
  stepId: string,
  value: ActionStepDefinition["inputs"][string],
) =>
  ({
    kind: "action",
    stepId,
    actionDefinitionId: "if",
    description: "",
    inputs: {
      value,
      condition: {
        kind: "constant",
        payload: {
          kind: "FilterCondition",
          value: {
            kind: "all",
            conditions: [
              {
                kind: "condition",
                subject: { kind: "input", payloadKind: "Text" },
                operator: "startsWith",
                value: { kind: "Text", value: "https://" },
              },
            ],
          },
        },
      },
    },
  }) satisfies ActionStepDefinition;

/**
 * An If, `check`, on the flow's `url`, with a step on each path, and the same inside a for-each step `each`:
 *
 *   check ─Yes─▶ yes ─▶ afterYes ─┐
 *         └─No──▶ no ─────────────┴─▶ rejoin
 *
 * `yes` gets the file from the URL the If passes on, so it also takes a value from its path. Every other step gets it
 * from `url`, or its item. `each` collects `innerGet`, which isn't on a path.
 */
export const ifPathsFlowDefinition: FlowDefinition = {
  name: "Get files on paths",
  description: "Get a file on whichever path an If takes",
  inputs: [
    { name: "url", payloadKind: "Text", array: false, required: true },
    { name: "urls", payloadKind: "Text", array: true, required: true },
  ],
  steps: [
    ifStep("check", { kind: "flow-input", inputName: "url" }),
    getFileStep("yes", [{ stepId: "check", outputName: "true" }], {
      kind: "step-output",
      stepId: "check",
      outputName: "true",
      whenMissing: "skip",
    }),
    getFileStep("no", [{ stepId: "check", outputName: "false" }]),
    getFileStep("afterYes", [{ stepId: "yes" }]),
    getFileStep("rejoin", [{ stepId: "afterYes" }, { stepId: "no" }]),
    {
      kind: "for-each",
      stepId: "each",
      description: "",
      over: { kind: "flow-input", inputName: "urls" },
      steps: [
        ifStep("innerCheck", { kind: "item" }),
        getFileStep(
          "innerYes",
          [{ stepId: "innerCheck", outputName: "true" }],
          {
            kind: "item",
          },
        ),
        getFileStep("innerGet", undefined, { kind: "item" }),
      ],
      collect: { stepId: "innerGet", outputName: "fileEntity", as: "files" },
    },
  ],
  outputs: [],
};
