import {
  inferUserEntitiesFromWebPageFlowDefinition,
  researchTaskFlowDefinition,
} from "./example-flow-definitions";
import { triggerDefinitions } from "./node-definitions";
import type { Flow } from "./types";

export const researchTaskFlow: Flow = {
  flowId: "researchTaskFlow",
  trigger: {
    definition: triggerDefinitions.userTrigger,
  },
  definition: researchTaskFlowDefinition,
  inputs: {
    nodeId: "0",
    inputName: "prompt",
    payload: {
      kind: "Text",
      value: "Get board members of Apple Inc.",
    },
  },
  nodes: [],
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
    nodeId: "0",
    inputName: "prompt",
    payload: {
      kind: "Text",
      value: "Get board members of Apple Inc.",
    },
  },
  nodes: [],
};
