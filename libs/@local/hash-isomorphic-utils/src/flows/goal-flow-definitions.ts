import type { EntityUuid } from "@local/hash-graph-types/entity";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type GoalFlowTriggerInput =
  | "Research guidance"
  | "Entity Types"
  | "Create as draft";

export const goalFlowDefinition: FlowDefinition = {
  name: "Research and save to HASH",
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
        name: "Research guidance" as const satisfies GoalFlowTriggerInput,
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
          inputName: "prompt" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Research guidance" satisfies GoalFlowTriggerInput,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"researchEntities">,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Create as draft" satisfies GoalFlowTriggerInput,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "2",
      stepOutputName:
        "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
      payloadKind: "PersistedEntity",
      name: "persistedEntities" as const,
      array: false,
      required: true,
    },
  ],
};

export type GoogleSheetTriggerInput = "Google Account" | "Google Sheet";

export const goalFlowDefinitionWithSpreadsheetDeliverable: FlowDefinition = {
  name: "Research and save to Google Sheets",
  flowDefinitionId: "goal-with-spreadsheet" as EntityUuid,
  description:
    "Discover entities according to a research brief, save them to HASH and to a Google Sheet",
  trigger: {
    triggerDefinitionId: "userTrigger",
    description:
      "User provides research specification and entity types to discover",
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "Research guidance" as const satisfies GoalFlowTriggerInput,
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
      {
        payloadKind: "GoogleAccountId",
        name: "Google Account" satisfies GoogleSheetTriggerInput,
        array: false,
        required: true,
      },
      {
        payloadKind: "GoogleSheet",
        name: "Google Sheet" satisfies GoogleSheetTriggerInput,
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
    {
      groupId: 2,
      description: "Deliver Google Sheet",
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
          inputName: "prompt" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Research guidance" satisfies GoalFlowTriggerInput,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"researchEntities">,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Create as draft" satisfies GoalFlowTriggerInput,
        },
      ],
    },
    {
      stepId: "3",
      groupId: 2,
      kind: "action",
      actionDefinitionId: "writeGoogleSheet",
      description: "Save discovered entities to Google Sheet",
      inputSources: [
        {
          inputName:
            "audience" satisfies InputNameForAction<"writeGoogleSheet">,
          kind: "hardcoded",
          payload: {
            kind: "ActorType",
            value: "human",
          },
        },
        {
          inputName:
            "googleAccountId" satisfies InputNameForAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Google Account" satisfies GoogleSheetTriggerInput,
        },
        {
          inputName:
            "googleSheet" satisfies InputNameForAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Google Sheet" satisfies GoogleSheetTriggerInput,
        },
        {
          inputName:
            "dataToWrite" satisfies InputNameForAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "2",
          sourceStepOutputName:
            "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "3",
      stepOutputName:
        "googleSheetEntity" satisfies OutputNameForAction<"writeGoogleSheet">,
      payloadKind: "PersistedEntity",
      name: "googleSheetEntity" as const,
      array: false,
      required: true,
    },
  ],
};

export type ReportTriggerInput = "Report specification";

export const goalFlowDefinitionWithReportDeliverable: FlowDefinition = {
  name: "Research and write a report",
  flowDefinitionId: "goal-with-report" as EntityUuid,
  description: "Write a report based on a research specification",
  trigger: {
    triggerDefinitionId: "userTrigger",
    description: "User provides report brief and research specification",
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "Research guidance" as const satisfies GoalFlowTriggerInput,
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
      {
        payloadKind: "Text",
        name: "Report specification" satisfies ReportTriggerInput,
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
    {
      groupId: 2,
      description: "Write report",
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
          inputName: "prompt" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Research guidance" satisfies GoalFlowTriggerInput,
        },
        {
          inputName:
            "entityTypeIds" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "Entity Types" satisfies GoalFlowTriggerInput,
        },
        {
          inputName:
            "reportSpecification" satisfies InputNameForAction<"researchEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Report specification" satisfies ReportTriggerInput,
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
            "proposedEntities" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
        },
        {
          inputName: "draft" satisfies InputNameForAction<"persistEntities">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName:
            "Create as draft" satisfies GoalFlowTriggerInput,
        },
      ],
    },
    {
      stepId: "3",
      groupId: 2,
      kind: "action",
      actionDefinitionId: "answerQuestion",
      description: "Write report based on the research specification",
      inputSources: [
        {
          inputName: "question" satisfies InputNameForAction<"answerQuestion">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "Report specification",
        },
        {
          inputName: "entities" satisfies InputNameForAction<"answerQuestion">,
          kind: "step-output",
          sourceStepId: "2",
          sourceStepOutputName:
            "persistedEntities" satisfies OutputNameForAction<"persistEntities">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "3",
      stepOutputName: "answer" satisfies OutputNameForAction<"answerQuestion">,
      payloadKind: "Text",
      name: "report" as const,
      array: false,
      required: true,
    },
  ],
};

export const goalFlowDefinitionIds = [
  goalFlowDefinition.flowDefinitionId,
  goalFlowDefinitionWithSpreadsheetDeliverable.flowDefinitionId,
  goalFlowDefinitionWithReportDeliverable.flowDefinitionId,
];
