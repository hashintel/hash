import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  AiFlowActionDefinitionId,
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "./action-definitions.js";
import {
  googleSheetDeliverable,
  googleSheetStep,
  googleSheetTriggerInputs,
} from "./goal-flow-definitions/google-sheets.js";
import {
  markdownReportDeliverable,
  markdownReportResearchEntitiesStepInput,
  markdownReportStep,
  markdownReportTriggerInputs,
} from "./goal-flow-definitions/markdown-report.js";
import type { FlowDefinition } from "./types.js";

export type GoalFlowTriggerInput =
  | "Research guidance"
  | "Entity Types"
  | "Create as draft";

export const goalFlowDefinition = {
  name: "Research and save to HASH",
  type: "ai",
  flowDefinitionId: "research-goal" as EntityUuid,
  description:
    "Discover entities according to a research brief, save them to HASH",
  trigger: {
    triggerDefinitionId: "userTrigger",
    description:
      "User provides research specification and entity types to discover",
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "Research guidance" satisfies GoalFlowTriggerInput,
        array: false,
        required: true,
      },
      {
        payloadKind: "VersionedUrl",
        name: "Entity Types" satisfies GoalFlowTriggerInput,
        array: true,
        required: true,
      },
      {
        payloadKind: "Boolean",
        name: "Create as draft" satisfies GoalFlowTriggerInput,
        array: false,
        required: true,
      },
    ],
  },
  groups: [
    {
      groupId: 1,
      description: "Research and persist entities",
    },
  ],
  steps: [
    {
      stepId: "1",
      kind: "action",
      groupId: 1,
      actionDefinitionId: "researchEntities",
      description:
        "Discover entities according to research specification, using public web sources",
      inputSources: [
        {
          inputName:
            "prompt" satisfies InputNameForAiFlowAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Research guidance" satisfies GoalFlowTriggerInput,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAiFlowAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "Entity Types" satisfies GoalFlowTriggerInput,
        },
      ],
    },
    {
      stepId: "2",
      kind: "action",
      groupId: 1,
      description: "Save discovered entities and relationships to HASH graph",
      actionDefinitionId: "persistEntities",
      inputSources: [
        {
          inputName:
            "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAiFlowAction<"researchEntities">,
        },
        {
          inputName:
            "draft" satisfies InputNameForAiFlowAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Create as draft" satisfies GoalFlowTriggerInput,
        },
      ],
    },
  ],
  outputs: [],
} satisfies FlowDefinition<AiFlowActionDefinitionId>;

export const goalFlowDefinitionWithSpreadsheetDeliverable: FlowDefinition<AiFlowActionDefinitionId> =
  {
    ...goalFlowDefinition,
    type: "ai",
    name: "Research and save entities to Google Sheets",
    flowDefinitionId: "goal-with-spreadsheet" as EntityUuid,
    description:
      "Discover entities according to a research brief, save them to HASH and to a Google Sheet",
    groups: [
      {
        groupId: 1,
        description: "Research and persist entities",
      },
      {
        groupId: 2,
        description: "Deliver Google Sheet",
      },
    ],
    trigger: {
      ...goalFlowDefinition.trigger,
      outputs: [
        ...goalFlowDefinition.trigger.outputs,
        ...googleSheetTriggerInputs,
      ],
    },
    steps: [
      ...goalFlowDefinition.steps,
      {
        ...googleSheetStep,
        groupId: 2,
        stepId: "3",
      },
    ],
    outputs: [
      {
        ...googleSheetDeliverable,
        stepId: "3",
      },
    ],
  };

export const goalFlowDefinitionWithReportDeliverable: FlowDefinition<AiFlowActionDefinitionId> =
  {
    ...goalFlowDefinition,
    type: "ai",
    name: "Research and write a report",
    flowDefinitionId: "goal-with-report" as EntityUuid,
    description: "Write a report based on a research specification",
    groups: [
      {
        groupId: 1,
        description: "Research and persist entities",
      },
      {
        groupId: 2,
        description: "Write report",
      },
    ],
    trigger: {
      ...goalFlowDefinition.trigger,
      outputs: [
        ...goalFlowDefinition.trigger.outputs,
        ...markdownReportTriggerInputs,
      ],
    },
    steps: [
      {
        ...goalFlowDefinition.steps[0]!,
        inputSources: [
          ...goalFlowDefinition.steps[0]!.inputSources,
          markdownReportResearchEntitiesStepInput,
        ],
      },
      goalFlowDefinition.steps[1]!,
      {
        ...markdownReportStep,
        groupId: 2,
        stepId: "3",
      },
    ],
    outputs: [
      {
        ...markdownReportDeliverable,
        stepId: "3",
      },
    ],
  };

export const goalFlowDefinitionWithReportAndSpreadsheetDeliverable: FlowDefinition<AiFlowActionDefinitionId> =
  {
    ...goalFlowDefinition,
    type: "ai",
    name: "Research and write a report, save entities to Google Sheets",
    flowDefinitionId: "goal-with-report-and-sheet" as EntityUuid,
    description:
      "Write a report based on a research specification, save discovered entities to a Google Sheet",
    groups: [
      {
        groupId: 1,
        description: "Research and persist entities",
      },
      {
        groupId: 2,
        description: "Produce deliverables",
      },
    ],
    trigger: {
      ...goalFlowDefinition.trigger,
      outputs: [
        ...goalFlowDefinition.trigger.outputs,
        ...markdownReportTriggerInputs,
        ...googleSheetTriggerInputs,
      ],
    },
    steps: [
      {
        ...goalFlowDefinition.steps[0]!,
        inputSources: [
          ...goalFlowDefinition.steps[0]!.inputSources,
          markdownReportResearchEntitiesStepInput,
        ],
      },
      goalFlowDefinition.steps[1]!,
      {
        ...markdownReportStep,
        groupId: 2,
        stepId: "3",
      },
      {
        ...googleSheetStep,
        groupId: 2,
        stepId: "4",
      },
    ],
    outputs: [
      {
        ...markdownReportDeliverable,
        stepId: "3",
      },
      {
        ...googleSheetDeliverable,
        stepId: "4",
      },
    ],
  };

export const goalFlowDefinitionIds = [
  goalFlowDefinition.flowDefinitionId,
  goalFlowDefinitionWithSpreadsheetDeliverable.flowDefinitionId,
  goalFlowDefinitionWithReportDeliverable.flowDefinitionId,
  goalFlowDefinitionWithReportAndSpreadsheetDeliverable,
];
