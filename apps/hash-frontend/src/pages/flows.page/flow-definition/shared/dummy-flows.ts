// import { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
// import { triggerDefinitions } from "@local/hash-isomorphic-utils/flows/trigger-definitions";
// import {
//   actionDefinitions,
//   InputNameForAction,
//   OutputNameForAction,
// } from "@local/hash-isomorphic-utils/flows/action-definitions";
//
// export const dummyFlows: FlowDefinition[] = [
//   {
//     name: "Parallel dependencies",
//     trigger: {
//       kind: "trigger",
//       triggerDefinitionId: "userTrigger",
//       outputs: [
//         {
//           payloadKind: "Text",
//           name: "prompt",
//           array: false,
//           required: true
//         },
//         {
//           payloadKind: "Text",
//           name: "entityTypes",
//           array: false,
//           required: true
//         },
//       ],
//     },
//     steps: [
//       {
//         stepId: "0",
//         kind: "action",
//         actionDefinition: actionDefinitions.researchEntities,
//         inputSources: [
//           {
//             inputName:
//               "prompt" satisfies InputNameForAction<"generateWebQuery">,
//             kind: "step-output",
//             sourceStepId: "trigger",
//             sourceStepOutputName: "prompt",
//           },
//         ],
//       },
//       {
//         stepId: "1",
//         kind: "action",
//         actionDefinition: actionDefinitions.webSearch,
//         inputSources: [
//           {
//             inputName:
//               "prompt" satisfies InputNameForAction<"generateWebQuery">,
//             kind: "step-output",
//             sourceStepId: "trigger",
//             sourceStepOutputName: "prompt",
//           },
//         ],
//       },
//       {
//         stepId: "2",
//         kind: "action",
//         actionDefinition: actionDefinitions.inferEntitiesFromContent,
//         inputSources: [
//           {
//             inputName:
//               "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
//             kind: "step-output",
//             sourceStepId: "0",
//             sourceStepOutputName:
//               "webPage" satisfies OutputNameForAction<"webSearch">,
//           },
//           {
//             inputName:
//               "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
//             kind: "step-output",
//             sourceStepId: "1",
//             sourceStepOutputName: "entityTypeIds",
//           },
//         ],
//       },
//       {
//         stepId: "3",
//         kind: "action",
//         actionDefinition: actionDefinitions.inferEntitiesFromContent,
//         inputSources: [
//           {
//             inputName:
//               "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
//             kind: "step-output",
//             sourceStepId: "0",
//             sourceStepOutputName:
//               "webPage" satisfies OutputNameForAction<"webSearch">,
//           },
//           {
//             inputName:
//               "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
//             kind: "step-output",
//             sourceStepId: "trigger",
//             sourceStepOutputName: "entityTypes",
//           },
//         ],
//       },
//     ],
//   },
// ];
