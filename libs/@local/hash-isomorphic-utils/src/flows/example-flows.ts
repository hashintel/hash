import {
  inferUserEntitiesFromWebPageFlowDefinition,
  researchTaskFlowDefinition,
} from "./example-flow-definitions";
import { triggerDefinitions } from "./step-definitions";
import type { Flow } from "./types";

export const researchTaskFlow: Flow = {
  flowId: "researchTaskFlow",
  trigger: {
    definition: triggerDefinitions.userTrigger,
  },
  definition: researchTaskFlowDefinition,
  inputs: {
    stepId: "0",
    inputName: "prompt",
    payload: {
      kind: "Text",
      value: "Get board members of Apple Inc.",
    },
  },
  steps: [],
};

export const inferUserEntitiesFromWebPageFlow: Flow = {
  flowId: "inferUserEntitiesFromWebPageFlow",
  trigger: {
    definition: triggerDefinitions.userVisitedWebPageTrigger,
    outputs: [
      {
        outputName: "visitedWebPage",
        payload: {
          kind: "WebPage",
          value: {
            url: "https://example.com",
            title: "Example web page",
            textContent:
              "This is an example web page about Bob, who is a software engineer at Apple Inc.",
          },
        },
      },
    ],
  },
  definition: inferUserEntitiesFromWebPageFlowDefinition,
  inputs: {
    stepId: "0",
    inputName: "prompt",
    payload: {
      kind: "Text",
      value: "Get board members of Apple Inc.",
    },
  },
  steps: [],
};
