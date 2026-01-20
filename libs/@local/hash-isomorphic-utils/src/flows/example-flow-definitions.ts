import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  AiFlowActionDefinitionId,
  InputNameForAiFlowAction,
  OutputNameForAiFlowAction,
} from "./action-definitions.js";
import type { FlowDefinition } from "./types.js";

export const researchTaskFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "Research task",
    type: "ai",
    flowDefinitionId: "research-task" as EntityUuid,
    description:
      "Conduct research on a given topic, and provide expert analysis on the discovered data",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User provides research specification and entity types to discover",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "Research guidance",
          array: false,
          required: true,
        },
        {
          payloadKind: "VersionedUrl",
          name: "Entity Types",
          array: true,
          required: true,
        },
        {
          payloadKind: "Text",
          name: "Research question",
          array: false,
          required: true,
        },
        {
          payloadKind: "GoogleAccountId",
          name: "Google Account",
          array: false,
          required: true,
        },
        {
          payloadKind: "GoogleSheet",
          name: "Google Sheet",
          array: false,
          required: true,
        },
        {
          payloadKind: "Boolean",
          name: "Create as draft",
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
        description: "Perform analysis and write to Google Sheet",
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
            sourceStepOutputName: "Research guidance",
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAiFlowAction<"researchEntities">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Entity Types",
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
            sourceStepOutputName: "Create as draft",
          },
        ],
      },
      {
        stepId: "3",
        groupId: 2,
        kind: "action",
        actionDefinitionId: "answerQuestion",
        description: "Answer user's question using discovered entities",
        inputSources: [
          {
            inputName:
              "question" satisfies InputNameForAiFlowAction<"answerQuestion">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Research question",
          },
          {
            inputName:
              "entities" satisfies InputNameForAiFlowAction<"answerQuestion">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
          },
        ],
      },
      {
        stepId: "4",
        groupId: 2,
        kind: "action",
        actionDefinitionId: "writeGoogleSheet",
        description: "Save CSV to Google Sheet",
        inputSources: [
          {
            inputName:
              "audience" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "hardcoded",
            payload: {
              kind: "ActorType",
              value: "user",
            },
          },
          {
            inputName:
              "googleAccountId" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Google Account",
          },
          {
            inputName:
              "googleSheet" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Google Sheet",
          },
          {
            inputName:
              "dataToWrite" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "3",
            sourceStepOutputName:
              "answer" satisfies OutputNameForAiFlowAction<"answerQuestion">,
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "3",
        stepOutputName:
          "answer" satisfies OutputNameForAiFlowAction<"answerQuestion">,
        payloadKind: "Text",
        name: "answer" as const,
        array: false,
        required: true,
      },
      {
        stepId: "4",
        stepOutputName:
          "googleSheetEntity" satisfies OutputNameForAiFlowAction<"writeGoogleSheet">,
        payloadKind: "PersistedEntityMetadata",
        name: "googleSheetEntity" as const,
        array: false,
        required: true,
      },
    ],
  };

export const researchEntitiesFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "Research entities",
    type: "ai",
    flowDefinitionId: "research-entities" as EntityUuid,
    description:
      "Discover entities according to a research brief, save them to HASH and Google Sheets",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User provides research specification and entity types to discover",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "Research guidance",
          array: false,
          required: true,
        },
        {
          payloadKind: "VersionedUrl",
          name: "Entity Types",
          array: true,
          required: true,
        },
        {
          payloadKind: "GoogleAccountId",
          name: "Google Account",
          array: false,
          required: true,
        },
        {
          payloadKind: "GoogleSheet",
          name: "Google Sheet",
          array: false,
          required: true,
        },
        {
          payloadKind: "Boolean",
          name: "Create as draft",
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
        description: "Save data to Google Sheet",
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
            sourceStepOutputName: "Research guidance",
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAiFlowAction<"researchEntities">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Entity Types",
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
            sourceStepOutputName: "Create as draft",
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
              "audience" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "hardcoded",
            payload: {
              kind: "ActorType",
              value: "user",
            },
          },
          {
            inputName:
              "googleAccountId" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Google Account",
          },
          {
            inputName:
              "googleSheet" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Google Sheet",
          },
          {
            inputName:
              "dataToWrite" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "3",
        stepOutputName:
          "googleSheetEntity" satisfies OutputNameForAiFlowAction<"writeGoogleSheet">,
        payloadKind: "PersistedEntityMetadata",
        name: "googleSheetEntity" as const,
        array: false,
        required: true,
      },
    ],
  };

export const ftseInvestorsFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "FTSE350 investors",
    type: "ai",
    flowDefinitionId: "ftse-350-investors" as EntityUuid,
    description:
      "Research the FTSE350 index, its constituents, and the top investors in the index",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User chooses the web to output data to, and whether entities should be created as draft",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Boolean",
          name: "draft",
          array: false,
          required: false,
        },
      ],
    },
    groups: [
      {
        groupId: 1,
        description: "Research FTSE350 constituents",
      },
      {
        groupId: 2,
        description: "Research investments in the FTSE350",
      },
      {
        groupId: 3,
        description: "Calculate top investors",
      },
    ],
    steps: [
      {
        stepId: "1",
        groupId: 1,
        kind: "action",
        actionDefinitionId: "researchEntities",
        description: "Research the constituents of the FTSE350 index",
        inputSources: [
          {
            inputName:
              "prompt" satisfies InputNameForAiFlowAction<"researchEntities">,
            kind: "hardcoded",
            payload: {
              kind: "Text",
              value: "Find the constituents in the FTSE350 index",
            },
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAiFlowAction<"researchEntities">,
            kind: "hardcoded",
            payload: {
              kind: "VersionedUrl",
              value: [
                "https://hash.ai/@h/types/entity-type/stock-market-constituent/v/1",
                "https://hash.ai/@h/types/entity-type/stock-market-index/v/1",
              ],
            },
          },
        ],
      },
      {
        stepId: "2",
        groupId: 1,
        kind: "action",
        description: "Save discovered members of the FTSE350 to HASH graph",
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
            sourceStepOutputName: "draft",
          },
        ],
      },
      {
        stepId: "3",
        groupId: 2,
        kind: "parallel-group",
        description: "Research investors and investments in FTSE350 companies",
        inputSourceToParallelizeOn: {
          inputName: "existingEntities",
          kind: "step-output",
          sourceStepId: "2",
          sourceStepOutputName:
            "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
        },
        steps: [
          {
            stepId: "3.1",
            groupId: 2,
            kind: "action",
            actionDefinitionId: "researchEntities",
            description:
              "Research investors and investments in a FTSE350 company",
            inputSources: [
              {
                inputName:
                  "prompt" satisfies InputNameForAiFlowAction<"researchEntities">,
                kind: "hardcoded",
                payload: {
                  kind: "Text",
                  value:
                    "Find the investors in the provided FTSE350 constituent, and their investments in that company",
                },
              },
              {
                inputName:
                  "entityTypeIds" satisfies InputNameForAiFlowAction<"researchEntities">,
                kind: "hardcoded",
                payload: {
                  kind: "VersionedUrl",
                  value: [
                    "https://hash.ai/@h/types/entity-type/invested-in/v/1",
                    "https://hash.ai/@h/types/entity-type/investment-fund/v/1",
                    "https://hash.ai/@h/types/entity-type/company/v/1",
                  ],
                },
              },
              {
                inputName:
                  "existingEntities" satisfies InputNameForAiFlowAction<"researchEntities">,
                kind: "parallel-group-input",
              },
            ],
          },
          {
            stepId: "3.2",
            groupId: 2,
            kind: "action",
            description:
              "Save discovered FTSE350 investors and their investments to HASH graph",
            actionDefinitionId: "persistEntities",
            inputSources: [
              {
                inputName:
                  "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
                kind: "step-output",
                sourceStepId: "3.1",
                sourceStepOutputName:
                  "proposedEntities" satisfies OutputNameForAiFlowAction<"researchEntities">,
              },
              {
                inputName:
                  "draft" satisfies InputNameForAiFlowAction<"persistEntities">,
                kind: "step-output",
                sourceStepId: "trigger",
                sourceStepOutputName: "draft",
              },
            ],
          },
        ],
        aggregateOutput: {
          stepId: "3.2",
          stepOutputName:
            "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
          required: true,
          name: "persistedEntities" as const,
          payloadKind: "PersistedEntityMetadata",
          array: true,
        },
      },
      {
        stepId: "4",
        groupId: 3,
        kind: "action",
        actionDefinitionId: "answerQuestion",
        description:
          "Calculate the top 10 investors in the FTSE350 by market cap",
        inputSources: [
          {
            inputName:
              "question" satisfies InputNameForAiFlowAction<"answerQuestion">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "question",
          },
          {
            inputName:
              "entities" satisfies InputNameForAiFlowAction<"answerQuestion">,
            kind: "step-output",
            sourceStepId: "3",
            sourceStepOutputName:
              "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "3",
        stepOutputName:
          "persistedEntities" satisfies OutputNameForAiFlowAction<"persistEntities">,
        name: "persistedEntities" as const,
        payloadKind: "PersistedEntitiesMetadata",
        array: false,
        required: true,
      },
      {
        stepId: "4",
        stepOutputName:
          "answer" satisfies OutputNameForAiFlowAction<"answerQuestion">,
        payloadKind: "Text",
        name: "answer" as const,
        array: false,
        required: true,
      },
    ],
  };

export const inferUserEntitiesFromWebPageFlowDefinition: FlowDefinition<AiFlowActionDefinitionId> =
  {
    name: "Analyze webpage entities",
    type: "ai",
    flowDefinitionId: "infer-user-entities-from-web-page" as EntityUuid,
    description:
      "Infer entities from a web page, based on the user's provided entity types",
    trigger: {
      kind: "trigger",
      description: "Triggered when user visits a web page",
      triggerDefinitionId: "userTrigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "visitedWebPageUrl",
          array: false,
          required: true,
        },
        {
          payloadKind: "VersionedUrl",
          name: "entityTypeIds",
          array: true,
          required: true,
        },
        {
          payloadKind: "Boolean",
          name: "draft",
          array: false,
          required: true,
        },
      ],
    },
    steps: [
      {
        stepId: "0",
        kind: "action",
        actionDefinitionId: "getWebPageByUrl",
        description: "Retrieve web page content from URL",
        inputSources: [
          {
            inputName:
              "url" satisfies InputNameForAiFlowAction<"getWebPageByUrl">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "visitedWebPageUrl",
          },
        ],
      },
      {
        stepId: "1",
        kind: "action",
        actionDefinitionId: "inferEntitiesFromContent",
        description: "Infer entities from web page content",
        inputSources: [
          {
            inputName:
              "content" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "0",
            sourceStepOutputName:
              "webPage" satisfies OutputNameForAiFlowAction<"getWebPageByUrl">,
          },
          {
            inputName:
              "entityTypeIds" satisfies InputNameForAiFlowAction<"inferEntitiesFromContent">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "entityTypeIds",
          },
        ],
      },
      {
        stepId: "2",
        kind: "action",
        actionDefinitionId: "persistEntities",
        description: "Save proposed entities to database",
        inputSources: [
          {
            inputName:
              "proposedEntities" satisfies InputNameForAiFlowAction<"persistEntities">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "proposedEntities" satisfies OutputNameForAiFlowAction<"inferEntitiesFromContent">,
          },
          {
            inputName:
              "draft" satisfies InputNameForAiFlowAction<"persistEntities">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "draft",
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "2",
        stepOutputName: "persistedEntities",
        name: "persistedEntities" as const,
        payloadKind: "PersistedEntityMetadata",
        array: true,
        required: true,
      },
    ],
  };

export const answerQuestionFlow: FlowDefinition<AiFlowActionDefinitionId> = {
  name: "Answer question",
  type: "ai",
  flowDefinitionId: "answer-question-flow" as EntityUuid,
  description: "Answer a question based on the provided context",
  trigger: {
    kind: "trigger",
    description: "Triggered when user asks a question and provides context",
    triggerDefinitionId: "userTrigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "question",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "context",
        array: false,
        required: true,
      },
      {
        payloadKind: "GoogleAccountId",
        name: "Google Account",
        array: false,
        required: true,
      },
      {
        payloadKind: "GoogleSheet",
        name: "Google Sheet",
        array: false,
        required: true,
      },
      {
        payloadKind: "Boolean",
        name: "Create as draft",
        array: false,
        required: true,
      },
    ],
  },
  steps: [
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "answerQuestion",
      description: "Answer question on the provided context",
      inputSources: [
        {
          inputName:
            "question" satisfies InputNameForAiFlowAction<"answerQuestion">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "question",
        },
        {
          inputName:
            "context" satisfies InputNameForAiFlowAction<"answerQuestion">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "context",
        },
      ],
    },
    {
      stepId: "2",
      kind: "action",
      actionDefinitionId: "writeGoogleSheet",
      description: "Save CSV to Google Sheet",
      inputSources: [
        {
          inputName:
            "audience" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
          kind: "hardcoded",
          payload: {
            kind: "ActorType",
            value: "user",
          },
        },
        {
          inputName:
            "googleAccountId" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "Google Account",
        },
        {
          inputName:
            "googleSheet" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "Google Sheet",
        },
        {
          inputName:
            "dataToWrite" satisfies InputNameForAiFlowAction<"writeGoogleSheet">,
          kind: "step-output",
          sourceStepId: "1",
          sourceStepOutputName:
            "answer" satisfies OutputNameForAiFlowAction<"answerQuestion">,
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "1",
      stepOutputName: "answer",
      name: "answer",
      payloadKind: "FormattedText",
      required: false,
      array: false,
    },
    {
      stepId: "1",
      stepOutputName: "explanation",
      name: "explanation",
      payloadKind: "Text",
      required: true,
      array: false,
    },
    {
      stepId: "1",
      stepOutputName: "code",
      name: "code",
      payloadKind: "Text",
      required: false,
      array: false,
    },
    {
      stepId: "1",
      stepOutputName: "confidence",
      name: "confidence",
      payloadKind: "Number",
      required: false,
      array: false,
    },
    {
      stepId: "2",
      stepOutputName:
        "googleSheetEntity" satisfies OutputNameForAiFlowAction<"writeGoogleSheet">,
      payloadKind: "PersistedEntityMetadata",
      name: "googleSheetEntity" as const,
      array: false,
      required: true,
    },
  ],
};

export const saveFileFromUrl: FlowDefinition<AiFlowActionDefinitionId> = {
  name: "Save file from URL",
  type: "ai",
  flowDefinitionId: "save-file-from-url" as EntityUuid,
  description: "Save file from URL to HASH",
  trigger: {
    triggerDefinitionId: "userTrigger",
    description: "Triggered when user provides a URL to a file",
    kind: "trigger",
    outputs: [
      {
        payloadKind: "Text",
        name: "url" as const,
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "description" as const,
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "displayName" as const,
        array: false,
        required: true,
      },
    ],
  },
  steps: [
    {
      stepId: "1",
      kind: "action",
      actionDefinitionId: "getFileFromUrl",
      description:
        "Retrieve file from URL, mirror into HASH and create associated entity",
      inputSources: [
        {
          inputName: "url" satisfies InputNameForAiFlowAction<"getFileFromUrl">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "url",
        },
        {
          inputName:
            "description" satisfies InputNameForAiFlowAction<"getFileFromUrl">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "description",
        },
        {
          inputName:
            "displayName" satisfies InputNameForAiFlowAction<"getFileFromUrl">,
          kind: "step-output",
          sourceStepId: "trigger",
          sourceStepOutputName: "displayName",
        },
      ],
    },
  ],
  outputs: [
    {
      stepId: "1",
      stepOutputName: "fileEntity",
      name: "fileEntity",
      payloadKind: "PersistedEntityMetadata",
      array: false,
      required: true,
    },
  ],
};
