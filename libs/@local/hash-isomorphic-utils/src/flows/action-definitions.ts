import { checkAggregationInput } from "./aggregation.js";
import {
  checkCreateEntityStep,
  checkUpdateEntityStep,
} from "./entity-steps.js";
import { checkConditionInput, filterableKinds } from "./filter-condition.js";
import { maxDraftMessageEntities, maxEntitiesPerStep } from "./limits.js";
import { checkSortKeyInput } from "./sort-key.js";
import { checkTakeCountInput } from "./take-count.js";
import { allPayloadKinds } from "./types.js";

import type { InferenceModelName } from "../ai-inference-types.js";
import type {
  AcceptedKinds,
  ActionActivitySettings,
  ActionDefinition,
  DeepReadOnly,
  FlowActionDefinitionId,
  InputDefinition,
  PayloadKind,
  PayloadValue,
  PayloadWithKind,
  StepInput,
} from "./types.js";

/**
 * Activities that are registered to the 'ai' temporal task queue.
 */
export type AiFlowActionDefinitionId =
  | "aggregate"
  | "analyzeEntityData"
  | "answerQuestion"
  | "createEntity"
  | "draftMessage"
  | "filterList"
  | "find"
  | "generateChartConfig"
  | "generateStructuralQuery"
  | "planDashboardRefinement"
  | "generateWebQueries"
  | "getFileFromUrl"
  | "getWebPageByUrl"
  | "getWebPageSummary"
  | "if"
  | "inferMetadataFromDocument"
  | "inferEntitiesFromContent"
  | "orderBy"
  | "processAutomaticBrowsingSettings"
  | "persistEntities"
  | "persistEntity"
  | "queryEntities"
  | "researchEntities"
  | "takeFirst"
  | "updateEntity"
  | "webSearch"
  | "writeGoogleSheet";

/**
 * Activities that are registered to the 'integration' temporal task queue.
 */
export type IntegrationFlowActionDefinitionId =
  | "getHistoricalFlightArrivals"
  | "getLiveFlightPositions"
  | "getScheduledFlights"
  | "persistIntegrationEntities";

/* How each action's activity is run (see `ActionActivitySettings`). */

/** An action that finishes within 5 minutes. */
const defaultActivitySettings = {
  startToCloseTimeoutSeconds: 300,
  handlesCancellation: false,
} as const satisfies ActionActivitySettings;

/** An action that heartbeats at least every 10 seconds, so can run for up to 10 hours. */
const heartbeatingActivitySettings = {
  startToCloseTimeoutSeconds: 36_000,
  heartbeatTimeoutSeconds: 10,
  handlesCancellation: false,
} as const satisfies ActionActivitySettings;

/** An action that heartbeats and handles cancellation, so can run for up to 10 hours, and a cancelled run waits for it. */
const cancellableActivitySettings = {
  ...heartbeatingActivitySettings,
  handlesCancellation: true,
} as const satisfies ActionActivitySettings;

/** An action that heartbeats at least every minute, so can run for up to 10 hours. */
const slowlyHeartbeatingActivitySettings = {
  startToCloseTimeoutSeconds: 36_000,
  heartbeatTimeoutSeconds: 60,
  handlesCancellation: false,
} as const satisfies ActionActivitySettings;

const aiFlowActionDefinitionsAsConst = {
  analyzeEntityData: {
    actionDefinitionId: "analyzeEntityData",
    activitySettings: defaultActivitySettings,
    name: "Analyze Entity Data",
    description: "Analyze entity data using Python code execution.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "structuralQuery",
        description: "The structural query filter as JSON",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "userGoal",
        description: "The user's visualization goal",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementInstruction",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingPythonScript",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementScope",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "targetChartType",
        description: "Optional target chart type",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "pythonScript",
        description: "The Python script used for data transformation",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "chartData",
        description: "The transformed chart data as JSON",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "suggestedChartType",
        description: "The recommended chart type",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "explanation",
        description: "Explanation of the data transformation approach",
        array: false,
        required: true,
      },
    ],
  },
  generateWebQueries: {
    actionDefinitionId: "generateWebQueries",
    activitySettings: defaultActivitySettings,
    name: "Generate Web Query",
    description: "Generate a web query based on a prompt and model.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "prompt",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "model",
        required: true,
        array: false,
        default: {
          kind: "Text",
          value: "gpt-4-turbo" satisfies InferenceModelName,
        },
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "queries",
        array: true,
        required: true,
      },
    ],
  },
  webSearch: {
    actionDefinitionId: "webSearch",
    activitySettings: defaultActivitySettings,
    name: "Web Search",
    description:
      "Perform a web search based on a query, and receive a list of URLs.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "query",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Number"],
        name: "numberOfSearchResults",
        required: true,
        array: false,
        default: {
          kind: "Number",
          value: 3,
        },
      },
    ],
    outputs: [
      {
        payloadKind: "WebSearchResult",
        name: "webSearchResult",
        array: true,
        required: true,
      },
    ],
  },
  getWebPageByUrl: {
    actionDefinitionId: "getWebPageByUrl",
    activitySettings: defaultActivitySettings,
    name: "Get Web Page From URL",
    description: "Get the title and content of a web page from its URL.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "url",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "WebPage",
        name: "webPage",
        array: false,
        required: true,
      },
    ],
  },
  processAutomaticBrowsingSettings: {
    actionDefinitionId: "processAutomaticBrowsingSettings",
    activitySettings: defaultActivitySettings,
    name: "Process Automatic Browsing Settings",
    description:
      "Given a web page, determine which entities to find based on the user's settings.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["WebPage"],
        name: "webPage",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "VersionedUrl",
        name: "entityTypeIds",
        description: "The entityTypeIds to look for given the web page visited",
        array: true,
        required: true,
      },
      {
        payloadKind: "Boolean",
        name: "draft",
        description: "Whether or not the entities should be created as drafts",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "model",
        description: "The LLM model to use to infer entities",
        required: true,
        array: false,
      },
    ],
  },
  inferEntitiesFromContent: {
    actionDefinitionId: "inferEntitiesFromContent",
    activitySettings: defaultActivitySettings,
    name: "Infer Entities From Content",
    description: "Generate proposals for entities based on text content.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text", "WebPage"],
        name: "content",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "model",
        required: true,
        default: {
          kind: "Text",
          value: "gpt-4-turbo" satisfies InferenceModelName,
        },
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "relevantEntitiesPrompt",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        array: true,
        required: true,
      },
    ],
  },
  inferMetadataFromDocument: {
    actionDefinitionId: "inferMetadataFromDocument",
    activitySettings: defaultActivitySettings,
    name: "Infer Metadata From Document",
    description:
      "Infer metadata from a document file (document kind, title, number of pages, etc), add the relevant type to the associated entity, and propose new entities representing its author, publisher etc.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "documentEntityId",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        description: "The entities inferred from the document, e.g. authors",
        name: "proposedEntities",
        array: true,
        required: true,
      },
      {
        payloadKind: "PersistedEntityMetadata",
        description: "The metadata representing the updated document entity.",
        name: "updatedDocumentEntity",
        array: false,
        required: true,
      },
    ],
  },
  persistEntity: {
    actionDefinitionId: "persistEntity",
    activitySettings: defaultActivitySettings,
    name: "Persist Entity",
    description: "Persist a proposed entity in the database.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["ProposedEntityWithResolvedLinks"],
        name: "proposedEntityWithResolvedLinks",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Boolean"],
        name: "draft",
        required: false,
        default: {
          kind: "Boolean",
          value: false,
        },
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "PersistedEntityMetadata",
        name: "persistedEntity",
        array: false,
        required: true,
      },
    ],
  },
  persistEntities: {
    actionDefinitionId: "persistEntities",
    activitySettings: heartbeatingActivitySettings,
    name: "Persist Entities",
    description: "Persist multiple proposed entities in the database.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["ProposedEntity"],
        name: "proposedEntities",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Boolean"],
        name: "draft",
        required: false,
        default: {
          kind: "Boolean",
          value: false,
        },
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "PersistedEntityMetadata",
        name: "persistedEntities",
        description: "The entities that were created or updated",
        array: true,
        required: true,
      },
      {
        payloadKind: "FailedEntityProposal",
        name: "failedEntityProposals",
        description: "The proposed entities that could not be persisted",
        array: true,
        required: true,
      },
    ],
  },
  getFileFromUrl: {
    actionDefinitionId: "getFileFromUrl",
    activitySettings: defaultActivitySettings,
    name: "Get File From URL",
    description: "Download a file from a URL and upload a copy to HASH",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "url",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "description",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "displayName",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "PersistedEntityMetadata",
        name: "fileEntity",
        array: false,
        required: true,
      },
    ],
  },
  researchEntities: {
    actionDefinitionId: "researchEntities",
    activitySettings: cancellableActivitySettings,
    name: "Research Entities",
    description: "Find entities on the web based on a research prompt.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds",
        required: false,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "prompt",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "reportSpecification",
        required: false,
        array: false,
      },
      /**
       * This is a placeholder for an 'additional context' input that can be used to provide context to the model,
       * e.g. a list of entities that are already known to the user, whether to enable the model to link proposed entities to,
       * or as useful context for a research task where some relevant data is already known.
       *
       * @todo make this do something / rethink it as needed
       */
      {
        oneOfPayloadKinds: ["PersistedEntityMetadata"],
        name: "existingEntities",
        required: false,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        array: true,
        required: true,
      },
      {
        payloadKind: "EntityId",
        name: "highlightedEntities",
        array: true,
        required: true,
      },
    ],
  },
  getWebPageSummary: {
    actionDefinitionId: "getWebPageSummary",
    activitySettings: defaultActivitySettings,
    name: "Get Web Page Summary",
    description: "Get a human-readable text summary of a web page.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "url",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "model",
        required: false,
        array: false,
        default: {
          kind: "Text",
          value: "claude-3-haiku" satisfies InferenceModelName,
        },
      },
      {
        oneOfPayloadKinds: ["Number"],
        name: "numberOfSentences",
        required: false,
        array: false,
        default: {
          kind: "Number",
          value: 3,
        },
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "summary",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "title",
        array: false,
        required: true,
      },
    ],
  },
  answerQuestion: {
    actionDefinitionId: "answerQuestion",
    activitySettings: defaultActivitySettings,
    name: "Answer Question Action",
    description:
      "Answer a question using the provided context. Question may specify any text output format, e.g. string, CSV, markdown, etc.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "question",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "context",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["PersistedEntityMetadata"],
        name: "entities",
        required: false,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "FormattedText",
        description: "The answer to the question, if one can be provided.",
        name: "answer",
        array: false,
        required: false,
      },
      {
        payloadKind: "Text",
        name: "explanation",
        description:
          "An explanation of the methodology and supporting context used to reach the answer, OR if no answer was provided, an explanation of why not, and what further data may help answer the question.",
        array: false,
        required: true,
      },
      {
        payloadKind: "Number",
        name: "confidence",
        description:
          "Confidence score of the answer, expressed as a number between 0 and 1",
        array: false,
        required: false,
      },
      {
        description: "Any source code used to generate the answer .",
        payloadKind: "Text",
        name: "sourceCode",
        array: false,
        required: false,
      },
    ],
  },
  generateChartConfig: {
    actionDefinitionId: "generateChartConfig",
    activitySettings: defaultActivitySettings,
    name: "Generate Chart Config",
    description:
      "Generate Apache ECharts configuration for chart data based on the user's visualization goal.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "chartData",
        description: "The chart data as JSON",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "chartType",
        description: "The type of chart to configure",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "userGoal",
        description: "The user's visualization goal",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementInstruction",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingChartConfig",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementScope",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "chartConfig",
        description: "The chart configuration as JSON",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "explanation",
        description: "Explanation of why this configuration was chosen",
        array: false,
        required: true,
      },
    ],
  },
  generateStructuralQuery: {
    actionDefinitionId: "generateStructuralQuery",
    activitySettings: defaultActivitySettings,
    name: "Generate Structural Query",
    description:
      "Generate a structural query for entity data based on a natural language goal.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "userGoal",
        description: "The user's visualization goal in natural language",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementInstruction",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingStructuralQuery",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingChartType",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementScope",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "structuralQuery",
        description: "The generated structural query as JSON",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "explanation",
        description: "Explanation of what the query does",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "suggestedChartTypes",
        description: "Suggested chart types as JSON array",
        array: false,
        required: false,
      },
    ],
  },
  planDashboardRefinement: {
    actionDefinitionId: "planDashboardRefinement",
    activitySettings: defaultActivitySettings,
    name: "Plan Dashboard Refinement",
    description:
      "Determine the earliest dashboard configuration stage affected by a refinement instruction.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "userGoal",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "refinementInstruction",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingStructuralQuery",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingPythonScript",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingChartType",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "existingChartConfig",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "refinementScope",
        description:
          'The earliest affected stage: "query", "analysis", "chart", or "none".',
        array: false,
        required: true,
      },
    ],
  },
  writeGoogleSheet: {
    actionDefinitionId: "writeGoogleSheet",
    activitySettings: defaultActivitySettings,
    name: "Write Google Sheet Action",
    description: "Writes the requested data to the specified Google Sheet",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["GoogleAccountId"],
        description: "The Google account to write data to.",
        name: "googleAccountId",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["GoogleSheet"],
        description:
          "An existing spreadsheet to write to, or the name of a new spreadsheet to create.",
        name: "googleSheet",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["FormattedText", "EntityId"],
        description:
          "The data to write to the Google Sheet, as either CSV-formatted text or the id of a query to retrieve the data via. Provide either this or `persistedEntities`.",
        name: "dataToWrite",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["PersistedEntityMetadata"],
        description:
          "Entities to write to the Google Sheet. Provide either this or `dataToWrite`.",
        name: "persistedEntities",
        required: false,
        array: true,
      },
      {
        oneOfPayloadKinds: ["ActorType"],
        description:
          "The type of audience for the Google Sheet, which affects formatting.",
        name: "audience",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "PersistedEntityMetadata",
        description:
          "The metadata representing the updated Google Sheet entity.",
        name: "googleSheetEntity",
        array: false,
        required: false,
      },
    ],
  },
  aggregate: {
    actionDefinitionId: "aggregate",
    activitySettings: defaultActivitySettings,
    name: "Aggregate",
    description:
      "Count the items of a list, or take the sum, average, minimum or maximum of a number read from each, ignoring items without one.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: filterableKinds,
        name: "items",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Aggregation"],
        name: "aggregation",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Number",
        name: "result",
        description:
          "The number. Missing for an average, minimum or maximum of no values.",
        array: false,
        required: false,
      },
    ],
    check: checkAggregationInput,
  },
  filterList: {
    actionDefinitionId: "filterList",
    activitySettings: defaultActivitySettings,
    name: "Filter List",
    description:
      "Split a list into the items that match a condition and those that don't, keeping their order.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: filterableKinds,
        name: "items",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["FilterCondition"],
        name: "condition",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        kindFrom: "items",
        name: "matching",
        array: true,
        required: true,
      },
      {
        kindFrom: "items",
        name: "nonMatching",
        array: true,
        required: true,
      },
    ],
    check: checkConditionInput("items"),
  },
  find: {
    actionDefinitionId: "find",
    activitySettings: defaultActivitySettings,
    name: "Find",
    description:
      "Find the first item of a list that matches a condition, or the first item if there is no condition.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: filterableKinds,
        name: "items",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["FilterCondition"],
        name: "condition",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        kindFrom: "items",
        name: "match",
        description: "The first matching item, if any matches.",
        array: false,
        required: false,
      },
    ],
    check: checkConditionInput("items"),
  },
  if: {
    actionDefinitionId: "if",
    activitySettings: defaultActivitySettings,
    name: "If",
    description:
      "Pass a value on unchanged to the true or false output, depending on whether it matches a condition.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: filterableKinds,
        name: "value",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["FilterCondition"],
        name: "condition",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        kindFrom: "value",
        name: "true",
        description: "The value, if it matches the condition.",
        array: false,
        required: false,
      },
      {
        kindFrom: "value",
        name: "false",
        description: "The value, if it doesn't match the condition.",
        array: false,
        required: false,
      },
    ],
    check: checkConditionInput("value"),
  },
  orderBy: {
    actionDefinitionId: "orderBy",
    activitySettings: defaultActivitySettings,
    name: "Order By",
    description:
      "Sort a list by the items, one of their fields or an entity property, keeping equal items in their order. Items without a value go last.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: filterableKinds,
        name: "items",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["SortKey"],
        name: "sortBy",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        kindFrom: "items",
        name: "items",
        array: true,
        required: true,
      },
    ],
    check: checkSortKeyInput,
  },
  queryEntities: {
    actionDefinitionId: "queryEntities",
    activitySettings: defaultActivitySettings,
    name: "Query Entities",
    description:
      "Get the entities in the web that match a graph query. Archived entities are left out.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["EntityQuery"],
        name: "query",
        description: `The graph's filter, sorting paths, limit, temporal axes and whether to include drafts. By default, entities are sorted by last edited first, as they were when the step started, without drafts. The limit is a whole number from 1 to ${maxEntitiesPerStep.toLocaleString("en")}. Without one, the step fails if more entities than that match.`,
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "EntityId",
        name: "entities",
        description: "The matching entities. Empty if none match.",
        array: true,
        required: true,
      },
    ],
  },
  createEntity: {
    actionDefinitionId: "createEntity",
    activitySettings: defaultActivitySettings,
    name: "Create Entity",
    description:
      "Create an entity of one or more types in the web the flow runs in, with values for some of its properties. Given the entities at its two ends, it creates a link.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds",
        description: "The types of the entity to create.",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["PropertyObjectWithMetadata"],
        name: "properties",
        description:
          "The entity's properties with their metadata, as the graph takes them: values keyed by property type base URL, each giving the ID of its data type and optionally its provenance and confidence.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Boolean"],
        name: "draft",
        description:
          "Whether to create the entity as a draft, whose required properties can be left out.",
        required: false,
        default: {
          kind: "Boolean",
          value: false,
        },
        array: false,
      },
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "leftEntityId",
        description:
          "For a link, the entity it links from. Give it with rightEntityId, and a link entity type.",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "rightEntityId",
        description:
          "For a link, the entity it links to. Give it with leftEntityId, and a link entity type.",
        required: false,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "EntityId",
        name: "entityId",
        description: "The new entity, with a draft ID if it's a draft.",
        array: false,
        required: true,
      },
    ],
    check: checkCreateEntityStep,
  },
  updateEntity: {
    actionDefinitionId: "updateEntity",
    activitySettings: defaultActivitySettings,
    name: "Update Entity",
    description:
      "Set or remove some of the properties of an entity in the web the flow runs in, leaving its other properties as they are, or change its types.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "entityId",
        description:
          "The entity to update: the draft for an entity ID with a draft ID, otherwise the live entity.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["PropertyPatch"],
        name: "propertyPatches",
        description:
          "The changes to make, in order, as the graph takes them. Each changes the whole property at its path, a property type base URL, and no two change the same property: add sets it, replacing any value it has; replace changes one the entity has; remove removes it if the entity has it. Added and replaced values give the ID of their data type. Can be empty if entityTypeIds is given.",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["VersionedUrl"],
        name: "entityTypeIds",
        description:
          "The types the entity should have instead of its current ones. The graph checks its properties, after any patches, against them.",
        required: false,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "EntityId",
        name: "entityId",
        description: "The entity updated: the same entity ID as given.",
        array: false,
        required: true,
      },
    ],
    check: checkUpdateEntityStep,
  },
  draftMessage: {
    actionDefinitionId: "draftMessage",
    activitySettings: defaultActivitySettings,
    name: "Draft Message",
    description:
      "Write a message, such as an email, with AI: a subject and a plain-text body, following instructions and using any context and entities given. Nothing is sent.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "instructions",
        description:
          "What the message should say, who it's for, and its tone, e.g. 'Thank the customer for their order and confirm the delivery date'.",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Text"],
        name: "context",
        description:
          "Text to draw on, e.g. a property read from an entity or an earlier step's summary.",
        required: false,
        array: false,
      },
      {
        oneOfPayloadKinds: ["EntityId"],
        name: "entities",
        description: `Entities whose properties to draw on: the draft for an entity ID with a draft ID, otherwise the live entity. At most ${maxDraftMessageEntities}, each in the web the flow runs in. Any that is missing or can't be read fails the step.`,
        required: false,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "subject",
        description: "The message's subject line.",
        array: false,
        required: true,
      },
      {
        payloadKind: "Text",
        name: "body",
        description:
          "The message's body, in plain text with line breaks: no HTML or Markdown.",
        array: false,
        required: true,
      },
    ],
  },
  takeFirst: {
    actionDefinitionId: "takeFirst",
    activitySettings: defaultActivitySettings,
    name: "Take First",
    description:
      "Keep the first items of a list, up to a count: all of them if the list is shorter.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: allPayloadKinds,
        name: "items",
        required: true,
        array: true,
      },
      {
        oneOfPayloadKinds: ["Number"],
        name: "count",
        description: "How many items to keep: a whole number, 0 or more.",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        kindFrom: "items",
        name: "items",
        array: true,
        required: true,
      },
    ],
    check: checkTakeCountInput,
  },
} as const satisfies Record<
  AiFlowActionDefinitionId,
  DeepReadOnly<ActionDefinition<AiFlowActionDefinitionId>>
>;

const integrationFlowActionDefinitionsAsConst = {
  getHistoricalFlightArrivals: {
    actionDefinitionId: "getHistoricalFlightArrivals",
    activitySettings: slowlyHeartbeatingActivitySettings,
    name: "Get Historical Flight Arrivals",
    description:
      "Fetch historical flight arrivals from AeroAPI for a given airport and date range.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "airportIcao",
        description:
          "The ICAO code of the airport (e.g. 'EGLL' for London Heathrow)",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Date"],
        name: "startDate",
        description:
          "The start date for the historical query in ISO format (e.g. '2024-01-15')",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Date"],
        name: "endDate",
        description:
          "The end date for the historical query in ISO format (e.g. '2024-01-16') – must be yesterday or earlier",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        description: "The proposed flight entities and related data",
        array: true,
        required: true,
      },
    ],
  },
  getLiveFlightPositions: {
    actionDefinitionId: "getLiveFlightPositions",
    activitySettings: defaultActivitySettings,
    name: "Get Live Flight Positions",
    description:
      "Fetch live flight positions from FlightRadar24 for flights that have departed or recently arrived.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["PersistedEntityMetadata"],
        name: "persistedEntities",
        description:
          "The persisted flight entities to check for live positions",
        required: true,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        description: "Updated flight entities with live position data",
        array: true,
        required: true,
      },
    ],
  },
  getScheduledFlights: {
    actionDefinitionId: "getScheduledFlights",
    activitySettings: defaultActivitySettings,
    name: "Get Scheduled Flights",
    description:
      "Fetch scheduled flight arrivals from AeroAPI for a given airport and date.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["Text"],
        name: "airportIcao",
        description:
          "The ICAO code of the airport (e.g. 'EGLL' for London Heathrow)",
        required: true,
        array: false,
      },
      {
        oneOfPayloadKinds: ["Date"],
        name: "date",
        description:
          "The date to fetch flights for in ISO format (e.g. '2024-01-15')",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        description: "The proposed flight entities and related data",
        array: true,
        required: true,
      },
    ],
  },
  persistIntegrationEntities: {
    actionDefinitionId: "persistIntegrationEntities",
    activitySettings: slowlyHeartbeatingActivitySettings,
    name: "Persist Integration Entities",
    description:
      "Persist proposed entities from an integration to the graph database.",
    kind: "action",
    inputs: [
      {
        oneOfPayloadKinds: ["ProposedEntity"],
        name: "proposedEntities",
        description: "The proposed entities to persist",
        required: true,
        array: true,
      },
    ],
    outputs: [
      {
        payloadKind: "PersistedEntityMetadata",
        name: "persistedEntities",
        description: "The entities that were created or updated",
        array: true,
        required: true,
      },
      {
        payloadKind: "FailedEntityProposal",
        name: "failedEntityProposals",
        description: "The proposed entities that could not be persisted",
        array: true,
        required: true,
      },
    ],
  },
} as const satisfies Record<
  IntegrationFlowActionDefinitionId,
  DeepReadOnly<ActionDefinition<IntegrationFlowActionDefinitionId>>
>;

export const aiActionDefinitions =
  aiFlowActionDefinitionsAsConst as unknown as Record<
    AiFlowActionDefinitionId,
    ActionDefinition<AiFlowActionDefinitionId>
  >;

export const integrationActionDefinitions =
  integrationFlowActionDefinitionsAsConst as unknown as Record<
    IntegrationFlowActionDefinitionId,
    ActionDefinition<IntegrationFlowActionDefinitionId>
  >;

export const actionDefinitions = {
  ...aiActionDefinitions,
  ...integrationActionDefinitions,
};

/**
 * Every action definition with its literal types preserved: input and output names, payload kinds, and the
 * `array`, `required` and `default` flags. Use this where the types matter (e.g. the typed flow builder), and
 * {@link actionDefinitions} for lookups by an id that is only known at runtime.
 */
export const typedActionDefinitions = {
  ...aiFlowActionDefinitionsAsConst,
  ...integrationFlowActionDefinitionsAsConst,
};

export type TypedActionDefinitions = typeof typedActionDefinitions;

/**
 * The types of an action definition's inputs and outputs: an entry of `typedActionDefinitions`, or an action
 * defined in a test.
 */
export type ActionDefinitionTypes = DeepReadOnly<
  Pick<ActionDefinition<FlowActionDefinitionId>, "inputs" | "outputs">
>;

type InputDefinitionOf<Definition extends ActionDefinitionTypes> =
  Definition["inputs"][number];

type OutputDefinitionOf<Definition extends ActionDefinitionTypes> =
  Definition["outputs"][number];

type InputDefinitionForFlowAction<Action extends FlowActionDefinitionId> =
  InputDefinitionOf<TypedActionDefinitions[Action]>;

type OutputDefinitionForFlowAction<Action extends FlowActionDefinitionId> =
  OutputDefinitionOf<TypedActionDefinitions[Action]>;

export type InputNameForFlowAction<Action extends FlowActionDefinitionId> =
  InputDefinitionForFlowAction<Action>["name"];

export type OutputNameForFlowAction<Action extends FlowActionDefinitionId> =
  OutputDefinitionForFlowAction<Action>["name"];

/** The names of the action's kind sources: the inputs that others take their kind from (see `KindFrom`). */
type KindSourceNameOf<Definition extends ActionDefinitionTypes> = Extract<
  InputDefinitionOf<Definition> | OutputDefinitionOf<Definition>,
  { kindFrom: string }
>["kindFrom"];

/**
 * The kinds each of the action's kind sources accepts, by input name.
 *
 * An action's implementation is generic over the kind each kind source is given (see `FlowActionActivity`), within
 * these. So TypeScript checks that the implementation returns that kind, where an output takes its kind from it.
 */
export type InputKindsOf<Definition extends ActionDefinitionTypes> = {
  [SourceName in KindSourceNameOf<Definition>]: AcceptedKinds<
    InputDefinitionOf<Definition>,
    Extract<InputDefinitionOf<Definition>, { name: SourceName }>
  >;
};

export type FlowActionInputKinds<Action extends FlowActionDefinitionId> =
  InputKindsOf<TypedActionDefinitions[Action]>;

/**
 * The kind given to the kind source named `SourceName`, out of `Kinds` (see `InputKindsOf`).
 *
 * A conditional type, rather than `Kinds[SourceName]`: TypeScript lets any kind `Kinds`' constraint allows be
 * assigned to that indexed type, but nothing other than the kind given to this one.
 */
type GivenKind<Kinds, SourceName> = SourceName extends keyof Kinds
  ? Kinds[SourceName] & PayloadKind
  : never;

declare const inputKinds: unique symbol;

/**
 * A step's inputs, as an action's implementation receives them.
 *
 * `Kinds` is the kind each of the action's kind sources was given (see `InputKindsOf`). It is only in the type, for
 * `getSimplifiedFlowActionInputs` to type those inputs with.
 */
export type FlowActionInputs<Kinds> = StepInput[] & {
  readonly [inputKinds]?: Kinds;
};

/** Whether `Type` is a union of more than one member. */
type IsUnion<Type, Whole = Type> = Type extends unknown
  ? [Whole] extends [Type]
    ? false
    : true
  : never;

/** A payload of any one of `Kind`: a union with a member per kind, so checking `kind` narrows `value`. */
type PayloadOfEachKind<
  Kind extends PayloadKind,
  IsArray extends boolean,
> = Kind extends PayloadKind ? PayloadWithKind<Kind, IsArray> : never;

/**
 * The type of an input as an action's implementation reads it (see `getSimplifiedFlowActionInputs`): a payload of
 * the kind given, for a kind source or an input that takes its kind from one; a payload of any of its kinds, for
 * another input that accepts more than one; and a bare value otherwise.
 */
type InputValueOf<Definition extends ActionDefinitionTypes, Kinds, InputName> =
  Extract<
    InputDefinitionOf<Definition>,
    { name: InputName }
  > extends infer Input
    ? Input extends {
        array: infer IsArray extends boolean;
        required: infer IsRequired extends boolean;
      }
      ?
          | (Input extends { kindFrom: infer SourceName }
              ? PayloadWithKind<GivenKind<Kinds, SourceName>, IsArray>
              : InputName extends KindSourceNameOf<Definition>
                ? PayloadWithKind<GivenKind<Kinds, InputName>, IsArray>
                : IsUnion<
                      AcceptedKinds<InputDefinitionOf<Definition>, Input>
                    > extends true
                  ? PayloadOfEachKind<
                      AcceptedKinds<InputDefinitionOf<Definition>, Input>,
                      IsArray
                    >
                  : PayloadValue<
                      AcceptedKinds<InputDefinitionOf<Definition>, Input>,
                      IsArray
                    >)
          | (IsRequired extends true ? never : undefined)
      : never
    : never;

/** A kind source, with the inputs and outputs that take their kind from it. */
export type KindSource = {
  input: Extract<
    InputDefinition,
    { oneOfPayloadKinds: readonly PayloadKind[] }
  >;
  derived: { name: string; of: "input" | "output" }[];
};

/**
 * Finds an action's kind sources, keyed by input name, each with the inputs and outputs that take their kind
 * from it.
 *
 * The validator uses it to report a kind source that isn't connected. `getPayloadInputNames` uses it to decide which
 * inputs an implementation receives as payloads.
 *
 * @throws if a `kindFrom` names an input the action doesn't have, or one that has a derived kind itself; if a
 *   required output takes its kind from an optional input, which may not be given; or if a kind source or a derived
 *   input has a default, whose kind is fixed.
 */
export const getKindSources = (
  actionDefinition: Pick<
    ActionDefinition<FlowActionDefinitionId>,
    "actionDefinitionId" | "inputs" | "outputs"
  >,
): Map<string, KindSource> => {
  const kindSources = new Map<string, KindSource>();

  for (const { definition, of } of [
    ...actionDefinition.inputs.map((input) => ({
      definition: input,
      of: "input" as const,
    })),
    ...actionDefinition.outputs.map((output) => ({
      definition: output,
      of: "output" as const,
    })),
  ]) {
    if (!("kindFrom" in definition)) {
      continue;
    }

    const input = actionDefinition.inputs.find(
      ({ name }) => name === definition.kindFrom,
    );

    const subject = `The ${of} "${definition.name}" of action "${actionDefinition.actionDefinitionId}"`;

    if (!input || !("oneOfPayloadKinds" in input)) {
      throw new Error(
        `${subject} takes its kind from input "${definition.kindFrom}", which the action doesn't have, or which takes its own kind from another`,
      );
    }

    if (of === "output" && definition.required && !input.required) {
      throw new Error(
        `${subject} is required, but takes its kind from input "${input.name}", which is optional: when it isn't given, the output has no kind`,
      );
    }

    if (
      ("default" in definition && definition.default !== undefined) ||
      input.default !== undefined
    ) {
      throw new Error(
        `${subject} takes its kind from input "${input.name}", so neither can have a default: a default has a fixed kind`,
      );
    }

    const kindSource = kindSources.get(input.name) ?? { input, derived: [] };

    kindSource.derived.push({ name: definition.name, of });
    kindSources.set(input.name, kindSource);
  }

  return kindSources;
};

/**
 * The names of the inputs an action's implementation receives as payloads, which carry their kind, rather than as
 * bare values: its kind sources, its inputs with a derived kind, and its other inputs that accept more than one kind.
 *
 * The implementation only learns those inputs' kinds when it runs, so it needs the kind with the value.
 */
export const getPayloadInputNames = (
  actionDefinition: Parameters<typeof getKindSources>[0],
): Set<string> =>
  new Set([
    ...[...getKindSources(actionDefinition)].flatMap(
      ([sourceName, { derived }]) => [
        sourceName,
        ...derived.flatMap(({ name, of }) => (of === "input" ? [name] : [])),
      ],
    ),
    ...actionDefinition.inputs.flatMap((input) =>
      "oneOfPayloadKinds" in input && input.oneOfPayloadKinds.length > 1
        ? [input.name]
        : [],
    ),
  ]);

/**
 * The record of inputs an action's implementation reads, keyed by input name, given the kind each kind source was
 * given (see `getSimplifiedFlowActionInputs`).
 */
export type SimplifiedInputsOf<
  Definition extends ActionDefinitionTypes,
  Kinds = InputKindsOf<Definition>,
> = {
  [InputName in InputDefinitionOf<Definition>["name"]]: InputValueOf<
    Definition,
    Kinds,
    InputName
  >;
};

type SimplifiedFlowActionInputsObject<
  Action extends FlowActionDefinitionId,
  Kinds,
> = SimplifiedInputsOf<TypedActionDefinitions[Action], Kinds>;

/**
 * Turns a step's inputs into the record an action implementation reads, keyed by input name.
 *
 * Each input is its bare value, except those `getPayloadInputNames` returns, which stay payloads: of the kind each
 * kind source was given, which `inputs` carries in its type (see `FlowActionInputs`), or of any kind another input
 * accepts.
 */
export const getSimplifiedFlowActionInputs = <
  Action extends FlowActionDefinitionId,
  Kinds extends FlowActionInputKinds<Action> = FlowActionInputKinds<Action>,
>(params: {
  inputs: FlowActionInputs<Kinds>;
  actionType: Action;
}): SimplifiedFlowActionInputsObject<Action, Kinds> => {
  const { inputs, actionType } = params;

  const payloadInputNames = getPayloadInputNames(actionDefinitions[actionType]);

  return inputs.reduce(
    (acc, input) => {
      const inputName = input.inputName as InputNameForFlowAction<Action>;

      acc[inputName] = (
        payloadInputNames.has(inputName) ? input.payload : input.payload.value
      ) as SimplifiedFlowActionInputsObject<Action, Kinds>[typeof inputName];

      return acc;
    },
    {} as SimplifiedFlowActionInputsObject<Action, Kinds>,
  );
};

/**
 * Type-safe output types for flow actions
 */

/**
 * Helper type to get a single StepOutput for a specific output definition.
 * If the output is an array, the payload value will be an array type.
 *
 * Uses a distributive conditional type to ensure that when Output is a union,
 * each member is processed individually, creating a proper discriminated union
 * where outputName and payload are correctly paired.
 *
 * An output with a derived kind is typed as a payload of the kind its kind source was given, out of `Kinds` (see
 * `InputKindsOf`). Where `Kinds` holds every kind each kind source accepts, as it does outside the action, the engine
 * checks the kind when the action returns.
 */
type ActionStepOutput<Output, Kinds> = Output extends {
  name: infer OutputName extends string;
  array: infer IsArray extends boolean;
}
  ? Output extends { payloadKind: infer Kind extends PayloadKind }
    ? {
        outputName: OutputName;
        payload: PayloadWithKind<Kind, IsArray>;
      }
    : Output extends { kindFrom: infer KindSourceName extends string }
      ? {
          outputName: OutputName;
          payload: PayloadWithKind<GivenKind<Kinds, KindSourceName>, IsArray>;
        }
      : never
  : never;

/**
 * The union of the outputs an action's implementation returns, given the kind each kind source was given.
 */
export type StepOutputOf<
  Definition extends ActionDefinitionTypes,
  Kinds = InputKindsOf<Definition>,
> = ActionStepOutput<OutputDefinitionOf<Definition>, Kinds>;

/**
 * Get the union of all typed StepOutput types for a given flow action.
 */
export type FlowActionStepOutput<
  Action extends FlowActionDefinitionId,
  Kinds = FlowActionInputKinds<Action>,
> = StepOutputOf<TypedActionDefinitions[Action], Kinds>;
