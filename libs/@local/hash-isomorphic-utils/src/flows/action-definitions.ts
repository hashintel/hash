import type { InferenceModelName } from "../ai-inference-types.js";
import type {
  AcceptedKinds,
  ActionDefinition,
  DeepReadOnly,
  FlowActionDefinitionId,
  InputDefinition,
  PayloadKind,
  PayloadOfKind,
  PayloadValue,
  StepInput,
} from "./types.js";

/**
 * Activities that are registered to the 'ai' temporal task queue.
 */
export type AiFlowActionDefinitionId =
  | "analyzeEntityData"
  | "answerQuestion"
  | "generateChartConfig"
  | "generateStructuralQuery"
  | "planDashboardRefinement"
  | "generateWebQueries"
  | "getFileFromUrl"
  | "getWebPageByUrl"
  | "getWebPageSummary"
  | "inferMetadataFromDocument"
  | "inferEntitiesFromContent"
  | "processAutomaticBrowsingSettings"
  | "persistEntities"
  | "persistEntity"
  | "researchEntities"
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

const aiFlowActionDefinitionsAsConst = {
  analyzeEntityData: {
    actionDefinitionId: "analyzeEntityData",
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
} as const satisfies Record<
  AiFlowActionDefinitionId,
  DeepReadOnly<ActionDefinition<AiFlowActionDefinitionId>>
>;

const integrationFlowActionDefinitionsAsConst = {
  getHistoricalFlightArrivals: {
    actionDefinitionId: "getHistoricalFlightArrivals",
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

type InputDefinitionForFlowAction<T extends FlowActionDefinitionId> =
  TypedActionDefinitions[T]["inputs"][number];

type OutputDefinitionForFlowAction<T extends FlowActionDefinitionId> =
  TypedActionDefinitions[T]["outputs"][number];

export type InputNameForFlowAction<T extends FlowActionDefinitionId> =
  InputDefinitionForFlowAction<T>["name"];

export type OutputNameForFlowAction<T extends FlowActionDefinitionId> =
  OutputDefinitionForFlowAction<T>["name"];

/**
 * The definitions of an action's inputs and outputs that take their kind from one of its inputs (`kindFrom`).
 */
type DerivedKindDefinitionForFlowAction<T extends FlowActionDefinitionId> =
  Extract<
    InputDefinitionForFlowAction<T> | OutputDefinitionForFlowAction<T>,
    { kindFrom: string }
  >;

/**
 * The inputs an action reads as payloads, which keep their kind, rather than as bare values: inputs that
 * another input or output takes its kind from, and inputs that take their kind from another. The action only learns their kind when it runs.
 */
type PayloadInputNameForFlowAction<T extends FlowActionDefinitionId> =
  | DerivedKindDefinitionForFlowAction<T>["kindFrom"]
  | Extract<InputDefinitionForFlowAction<T>, { kindFrom: string }>["name"];

/**
 * The kinds an input accepts: its own, or those of the input it takes its kind from.
 */
type InputPayloadKindForFlowAction<
  T extends FlowActionDefinitionId,
  N extends string,
> = AcceptedKinds<
  InputDefinitionForFlowAction<T>,
  Extract<InputDefinitionForFlowAction<T>, { name: N }>
>;

type FlowActionInputPayloadType<
  T extends FlowActionDefinitionId,
  N extends InputNameForFlowAction<T>,
> =
  Extract<InputDefinitionForFlowAction<T>, { name: N }> extends {
    array: infer A extends boolean;
    required: infer R extends boolean;
  }
    ?
        | (N extends PayloadInputNameForFlowAction<T>
            ? PayloadOfKind<InputPayloadKindForFlowAction<T, N>, A>
            : PayloadValue<InputPayloadKindForFlowAction<T, N>, A>)
        | (R extends true ? never : undefined)
    : never;

/**
 * An input of an action that other inputs or outputs take their kind from (`kindFrom`), with those inputs and
 * outputs.
 */
export type KindSource = {
  input: Extract<InputDefinition, { oneOfPayloadKinds: PayloadKind[] }>;
  derived: { name: string; of: "input" | "output" }[];
};

/**
 * The inputs of an action that other inputs or outputs take their kind from, by name. Throws if a `kindFrom` names
 * an input the action doesn't have, or one that takes its own kind from another.
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

    if (!input || !("oneOfPayloadKinds" in input)) {
      throw new Error(
        `The ${of} "${definition.name}" of action "${actionDefinition.actionDefinitionId}" takes its kind from input "${definition.kindFrom}", which the action doesn't have, or which takes its own kind from another`,
      );
    }

    const kindSource = kindSources.get(input.name) ?? { input, derived: [] };

    kindSource.derived.push({ name: definition.name, of });
    kindSources.set(input.name, kindSource);
  }

  return kindSources;
};

/**
 * The inputs an action reads as payloads, which keep their kind, rather than as bare values: inputs that another
 * input or output takes its kind from (`kindFrom`), and inputs that take their kind from another.
 */
export const getPayloadInputNames = (
  actionDefinition: Parameters<typeof getKindSources>[0],
): Set<string> =>
  new Set(
    [...getKindSources(actionDefinition)].flatMap(
      ([sourceName, { derived }]) => [
        sourceName,
        ...derived.flatMap(({ name, of }) => (of === "input" ? [name] : [])),
      ],
    ),
  );

type SimplifiedFlowActionInputsObject<T extends FlowActionDefinitionId> = {
  [N in InputNameForFlowAction<T>]: FlowActionInputPayloadType<T, N>;
};

/**
 * An action's inputs by name. An input is its bare value, except where another input or output takes its kind from it (`kindFrom`),
 * or it takes its kind from another: then it is the payload, which keeps its kind.
 */
export const getSimplifiedFlowActionInputs = <
  T extends FlowActionDefinitionId,
>(params: {
  inputs: StepInput[];
  actionType: T;
}): SimplifiedFlowActionInputsObject<T> => {
  const { inputs, actionType } = params;

  const payloadInputNames = getPayloadInputNames(actionDefinitions[actionType]);

  return inputs.reduce((acc, input) => {
    const inputName = input.inputName as InputNameForFlowAction<T>;

    acc[inputName] = (
      payloadInputNames.has(inputName) ? input.payload : input.payload.value
    ) as FlowActionInputPayloadType<T, typeof inputName>;

    return acc;
  }, {} as SimplifiedFlowActionInputsObject<T>);
};

/**
 * Type-safe output types for flow actions
 */

/**
 * Helper type to get a single StepOutput for a specific output definition.
 * If the output is an array, the payload value will be an array type.
 *
 * Uses a distributive conditional type to ensure that when OutputDef is a union,
 * each member is processed individually, creating a proper discriminated union
 * where outputName and payload are correctly paired.
 *
 * An output that takes its kind from an input (`kindFrom`) is a payload of any kind that input accepts: which one is
 * only known when the action runs, and the engine checks it matches the input's.
 */
type ActionStepOutput<
  T extends FlowActionDefinitionId,
  OutputDef extends OutputDefinitionForFlowAction<T>,
> = OutputDef extends {
  name: infer N extends string;
  array: infer A extends boolean;
}
  ? OutputDef extends { payloadKind: infer K extends PayloadKind }
    ? {
        outputName: N;
        payload: { kind: K; value: PayloadValue<K, A> };
      }
    : OutputDef extends { kindFrom: infer S extends string }
      ? {
          outputName: N;
          payload: PayloadOfKind<InputPayloadKindForFlowAction<T, S>, A>;
        }
      : never
  : never;

/**
 * Get the union of all typed StepOutput types for a given flow action.
 */
export type FlowActionStepOutput<T extends FlowActionDefinitionId> =
  ActionStepOutput<T, OutputDefinitionForFlowAction<T>>;
