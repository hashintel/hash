import type { EntityUuid } from "@local/hash-subgraph";

import type {
  InputNameForAction,
  OutputNameForAction,
} from "./action-definitions";
import type { FlowDefinition } from "./types";

export const researchTaskFlowDefinition: FlowDefinition = {
  name: "Research Task",
  flowDefinitionId: "research-task" as EntityUuid,
  trigger: {
    triggerDefinitionId: "userTrigger",
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "prompt" as const,
        array: false,
      },
      {
        payloadKind: "VersionedUrl",
        name: "entityTypeIds",
        array: true,
      },
    ],
  },
  steps: [
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "researchEntities",
      inputSources: [
        {
          inputName: "prompt" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "prompt",
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "entityTypeIds",
        },
      ],
    },
    {
      stepId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "proposedEntities",
        kind: "step-output",
        sourceStepId: "1",
        sourceStepOutputName:
          "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
      },
      steps: [
        {
          stepId: "2.0",
          kind: "action",
          actionDefinitionId: "persistEntity",
          inputSources: [
            {
              inputName:
                "proposedEntity" satisfies InputNameForAction<"persistEntity">,
              kind: "parallel-group-input",
            },
          ],
        },
      ],
      aggregateOutput: {
        stepId: "2.0",
        stepOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName: "persistedEntities",
      name: "persistedEntities" as const,
      payloadKind: "Entity",
      array: true,
    },
  ],
};

// export const researchTaskFlowDefinition: FlowDefinition = {
//   name: "Research Task",
//   flowDefinitionId: "research-task" as EntityUuid,
//   trigger: {
//     triggerDefinitionId: "userTrigger",
//     kind: "trigger",
//     outputs: [
//       {
//         payloadKind: "Text",
//         name: "prompt" as const,
//         array: false,
//       },
//       {
//         payloadKind: "VersionedUrl",
//         name: "entityTypeIds",
//         array: true,
//       },
//     ],
//   },
//   steps: [
//     {
//       stepId: "0",
//       kind: "action",
//       actionDefinitionId: "generateWebQueries",
//       inputSources: [
//         {
//           inputName:
//             "prompt" satisfies InputNameForAction<"generateWebQueries">,
//           kind: "step-output",
//           sourceStepId: "trigger",
//           sourceStepOutputName: "prompt",
//           // kind: "hardcoded",
//           // value: {
//           //   kind: "Text",
//           //   value: "Get board members of Apple Inc.",
//           // },
//         },
//       ],
//     },
//     {
//       stepId: "1",
//       kind: "action",
//       actionDefinitionId: "webSearch",
//       inputSources: [
//         {
//           inputName: "query" satisfies InputNameForAction<"webSearch">,
//           kind: "step-output",
//           sourceStepId: "trigger",
//           sourceStepOutputName: "prompt",
//         },
//       ],
//     },
//     {
//       stepId: "2",
//       kind: "parallel-group",
//       inputSourceToParallelizeOn: {
//         inputName: "webPageUrls",
//         kind: "step-output",
//         sourceStepId: "1",
//         sourceStepOutputName:
//           "webPageUrls" satisfies OutputNameForAction<"webSearch">,
//       },
//       steps: [
//         {
//           stepId: "2.1",
//           kind: "action",
//           actionDefinitionId: "getWebPageByUrl",
//           inputSources: [
//             {
//               inputName: "url" satisfies InputNameForAction<"getWebPageByUrl">,
//               kind: "parallel-group-input",
//             },
//           ],
//         },
//         {
//           stepId: "2.2",
//           kind: "action",
//           actionDefinitionId: "inferEntitiesFromContent",
//           inputSources: [
//             {
//               inputName:
//                 "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
//               kind: "step-output",
//               sourceStepId: "2.1",
//               sourceStepOutputName:
//                 "webPage" satisfies OutputNameForAction<"getWebPageByUrl">,
//             },
//             {
//               inputName:
//                 "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
//               kind: "step-output",
//               sourceStepId: "trigger",
//               sourceStepOutputName: "entityTypeIds",
//               // kind: "hardcoded",
//               // value: {
//               //   kind: "VersionedUrl",
//               //   /** @todo: use a different type here */
//               //   value: systemEntityTypes.user.entityTypeId,
//               // },
//             },
//             {
//               inputName:
//                 "relevantEntitiesPrompt" satisfies InputNameForAction<"inferEntitiesFromContent">,
//               kind: "step-output",
//               sourceStepId: "trigger",
//               sourceStepOutputName: "prompt",
//             },
//           ],
//         },
//         {
//           stepId: "2.3",
//           kind: "parallel-group",
//           inputSourceToParallelizeOn: {
//             inputName: "proposedEntity",
//             kind: "step-output",
//             sourceStepId: "2.2",
//             sourceStepOutputName:
//               "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
//           },
//           steps: [
//             {
//               stepId: "2.3.1",
//               kind: "action",
//               actionDefinitionId: "persistEntity",
//               inputSources: [
//                 {
//                   inputName:
//                     "proposedEntity" satisfies InputNameForAction<"persistEntity">,
//                   kind: "parallel-group-input",
//                 },
//               ],
//             },
//           ],
//           aggregateOutput: {
//             stepId: "2.3.1",
//             stepOutputName:
//               "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
//             name: "persistedEntities" as const,
//             payloadKind: "Entity",
//             array: true,
//           },
//         },
//       ],
//       aggregateOutput: {
//         stepId: "2.3",
//         stepOutputName: "persistedEntities",
//         name: "persistedEntities" as const,
//         payloadKind: "Entity",
//         array: true,
//       },
//     },
//   ],
//   outputs: [
//     {
//       stepId: "2",
//       stepOutputName:
//         "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
//       name: "persistedEntities" as const,
//       payloadKind: "Entity",
//       array: true,
//     },
//   ],
// };

export const inferUserEntitiesFromWebPageFlowDefinition: FlowDefinition = {
  name: "Infer User Entities from Web Page Flow",
  flowDefinitionId: "infer-user-entities-from-web-page" as EntityUuid,
  trigger: {
    kind: "trigger",
    triggerDefinitionId: "userTrigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "visitedWebPageUrl",
        array: false,
      },
      {
        payloadKind: "VersionedUrl",
        name: "entityTypeIds",
        array: true,
      },
    ],
  },
  steps: [
    {
      stepId: "0",
      kind: "action",
      actionDefinitionId: "getWebPageByUrl",
      inputSources: [
        {
          inputName: "url" satisfies InputNameForAction<"getWebPageByUrl">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "visitedWebPageUrl",
          // kind: "hardcoded",
          // value: {
          //   kind: "Text",
          //   value: "https://example.com",
          // },
        },
      ],
    },
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "inferEntitiesFromContent",
      inputSources: [
        {
          inputName:
            "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "0",
          sourceStepOutputName:
            "webPage" satisfies OutputNameForAction<"getWebPageByUrl">,
          // kind: "hardcoded",
          // value: {
          //   kind: "WebPage",
          //   value: {
          //     url: "https://example.com",
          //     title: "Example web page",
          //     textContent:
          //       "This is an example web page about Bob, who is a software engineer at Apple Inc.",
          //   },
          // },
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "entityTypeIds",
        },
      ],
    },
    {
      stepId: "2",
      kind: "parallel-group",
      inputSourceToParallelizeOn: {
        inputName: "proposedEntities",
        kind: "step-output",
        sourceStepId: "1",
        sourceStepOutputName:
          "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
      },
      steps: [
        {
          stepId: "2.0",
          kind: "action",
          actionDefinitionId: "persistEntity",
          inputSources: [
            {
              inputName:
                "proposedEntity" satisfies InputNameForAction<"persistEntity">,
              kind: "parallel-group-input",
            },
          ],
        },
      ],
      aggregateOutput: {
        stepId: "2.0",
        stepOutputName:
          "persistedEntity" satisfies OutputNameForAction<"persistEntity">,
        name: "persistedEntities" as const,
        payloadKind: "Entity",
        array: true,
      },
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName: "persistedEntities",
      name: "persistedEntities" as const,
      payloadKind: "Entity",
      array: true,
    },
  ],
};
