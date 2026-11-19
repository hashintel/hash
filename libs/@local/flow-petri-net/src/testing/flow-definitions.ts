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

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

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
