import type { InferenceModelName } from "../ai-inference-types.js";
import type {
  ActionDefinition,
  DeepReadOnly,
  PayloadKindValues,
  StepInput,
} from "./types.js";

/**
 * Activities that are registered to the 'ai' temporal task queue.
 */
export type AiFlowActionDefinitionId =
  | "answerQuestion"
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
  | "getScheduledFlights"
  | "persistIntegrationEntities";

const aiFlowActionDefinitionsAsConst = {
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
        payloadKind: "PersistedEntitiesMetadata",
        name: "persistedEntities",
        array: false,
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
        oneOfPayloadKinds: ["PersistedEntitiesMetadata"],
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
        oneOfPayloadKinds: ["PersistedEntitiesMetadata"],
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
        oneOfPayloadKinds: [
          "FormattedText",
          "PersistedEntitiesMetadata",
          "EntityId",
        ],
        description:
          "The data to write to the Google Sheet, as one of: CSV-formatted text; entities; or the id of a query to retrieve the data via.",
        name: "dataToWrite",
        required: true,
        array: false,
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
        payloadKind: "PersistedEntitiesMetadata",
        name: "persistedEntities",
        description:
          "The result of persisting the entities, including any failures",
        array: false,
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

export type InputNameForAiFlowAction<
  T extends keyof typeof aiFlowActionDefinitionsAsConst,
> = (typeof aiFlowActionDefinitionsAsConst)[T]["inputs"][number]["name"];

export type OutputNameForAiFlowAction<
  T extends keyof typeof aiFlowActionDefinitionsAsConst,
> = (typeof aiFlowActionDefinitionsAsConst)[T]["outputs"][number]["name"];

export type InputPayloadKindForAiFlowAction<
  T extends AiFlowActionDefinitionId,
  N extends InputNameForAiFlowAction<T>,
> = Extract<
  (typeof aiFlowActionDefinitionsAsConst)[T]["inputs"][number],
  { name: N }
>["oneOfPayloadKinds"][number];

export type InputNameForIntegrationFlowAction<
  T extends keyof typeof integrationFlowActionDefinitionsAsConst,
> =
  (typeof integrationFlowActionDefinitionsAsConst)[T]["inputs"][number]["name"];

export type OutputNameForIntegrationFlowAction<
  T extends keyof typeof integrationFlowActionDefinitionsAsConst,
> =
  (typeof integrationFlowActionDefinitionsAsConst)[T]["outputs"][number]["name"];

export type InputPayloadKindForIntegrationFlowAction<
  T extends IntegrationFlowActionDefinitionId,
  N extends InputNameForIntegrationFlowAction<T>,
> = Extract<
  (typeof integrationFlowActionDefinitionsAsConst)[T]["inputs"][number],
  { name: N }
>["oneOfPayloadKinds"][number];

export type OutputPayloadKindForAiFlowAction<
  T extends AiFlowActionDefinitionId,
  N extends OutputNameForAiFlowAction<T>,
> = Extract<
  (typeof aiFlowActionDefinitionsAsConst)[T]["outputs"][number],
  { name: N }
>["payloadKind"];

type AiFlowInputPayloadType<
  T extends AiFlowActionDefinitionId,
  N extends InputNameForAiFlowAction<T>,
> = Extract<
  (typeof aiFlowActionDefinitionsAsConst)[T]["inputs"][number],
  { name: N }
> extends { required: true; array: true }
  ? PayloadKindValues[InputPayloadKindForAiFlowAction<T, N>][]
  : Extract<
        (typeof aiFlowActionDefinitionsAsConst)[T]["inputs"][number],
        { name: N }
      > extends { required: false; array: true }
    ? PayloadKindValues[InputPayloadKindForAiFlowAction<T, N>][] | undefined
    : Extract<
          (typeof aiFlowActionDefinitionsAsConst)[T]["inputs"][number],
          { name: N }
        > extends { required: true; array: false }
      ? PayloadKindValues[InputPayloadKindForAiFlowAction<T, N>]
      : PayloadKindValues[InputPayloadKindForAiFlowAction<T, N>] | undefined;

type SimplifiedActionInputsObject<T extends AiFlowActionDefinitionId> = {
  [N in InputNameForAiFlowAction<T>]: AiFlowInputPayloadType<T, N>;
};

export const getSimplifiedAiFlowActionInputs = <
  T extends AiFlowActionDefinitionId,
>(params: {
  inputs: StepInput[];
  actionType: T;
}): SimplifiedActionInputsObject<T> => {
  const { inputs } = params;

  return inputs.reduce(
    (acc, input) => {
      const inputName = input.inputName as InputNameForAiFlowAction<T>;

      acc[inputName] = input.payload.value as AiFlowInputPayloadType<
        T,
        typeof inputName
      >;

      return acc;
    },
    {} as SimplifiedActionInputsObject<T>,
  );
};

type IntegrationFlowInputPayloadType<
  T extends IntegrationFlowActionDefinitionId,
  N extends InputNameForIntegrationFlowAction<T>,
> = Extract<
  (typeof integrationFlowActionDefinitionsAsConst)[T]["inputs"][number],
  { name: N }
> extends { required: true; array: true }
  ? PayloadKindValues[InputPayloadKindForIntegrationFlowAction<T, N>][]
  : Extract<
        (typeof integrationFlowActionDefinitionsAsConst)[T]["inputs"][number],
        { name: N }
      > extends { required: false; array: true }
    ?
        | PayloadKindValues[InputPayloadKindForIntegrationFlowAction<T, N>][]
        | undefined
    : Extract<
          (typeof integrationFlowActionDefinitionsAsConst)[T]["inputs"][number],
          { name: N }
        > extends { required: true; array: false }
      ? PayloadKindValues[InputPayloadKindForIntegrationFlowAction<T, N>]
      :
          | PayloadKindValues[InputPayloadKindForIntegrationFlowAction<T, N>]
          | undefined;

type SimplifiedIntegrationActionInputsObject<
  T extends IntegrationFlowActionDefinitionId,
> = {
  [N in InputNameForIntegrationFlowAction<T>]: IntegrationFlowInputPayloadType<
    T,
    N
  >;
};

export const getSimplifiedIntegrationFlowActionInputs = <
  T extends IntegrationFlowActionDefinitionId,
>(params: {
  inputs: StepInput[];
  actionType: T;
}): SimplifiedIntegrationActionInputsObject<T> => {
  const { inputs } = params;

  return inputs.reduce(
    (acc, input) => {
      const inputName = input.inputName as InputNameForIntegrationFlowAction<T>;

      acc[inputName] = input.payload.value as IntegrationFlowInputPayloadType<
        T,
        typeof inputName
      >;

      return acc;
    },
    {} as SimplifiedIntegrationActionInputsObject<T>,
  );
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
 */
type ActionStepOutput<
  OutputDef extends {
    name: string;
    payloadKind: keyof PayloadKindValues;
    array: boolean;
  },
> = OutputDef extends {
  name: infer N extends string;
  payloadKind: infer K extends keyof PayloadKindValues;
  array: infer A extends boolean;
}
  ? {
      outputName: N;
      payload: A extends true
        ? { kind: K; value: PayloadKindValues[K][] }
        : { kind: K; value: PayloadKindValues[K] };
    }
  : never;

/**
 * Get the union of all typed StepOutput types for a given AI flow action.
 */
export type AiActionStepOutput<T extends AiFlowActionDefinitionId> =
  ActionStepOutput<
    (typeof aiFlowActionDefinitionsAsConst)[T]["outputs"][number]
  >;

/**
 * Get the union of all typed StepOutput types for a given integration flow action.
 */
export type IntegrationActionStepOutput<
  T extends IntegrationFlowActionDefinitionId,
> = ActionStepOutput<
  (typeof integrationFlowActionDefinitionsAsConst)[T]["outputs"][number]
>;
