import type { InferenceModelName } from "../ai-inference-types";
import type {
  ActionDefinition,
  DeepReadOnly,
  PayloadKindValues,
  StepInput,
} from "./types";

const actionDefinitionIds = [
  "generateWebQueries",
  "webSearch",
  "getWebPageByUrl",
  "inferEntitiesFromContent",
  "persistEntity",
  "getFileFromUrl",
  "researchEntities",
  "getWebPageSummary",
] as const;

export type ActionDefinitionId = (typeof actionDefinitionIds)[number];

const defaultModel: InferenceModelName = "gpt-4-turbo";

const actionDefinitionsAsConst = {
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
          value: defaultModel,
        },
      },
    ],
    outputs: [
      {
        payloadKind: "Text",
        name: "queries",
        array: true,
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
        payloadKind: "Text",
        name: "webPageUrls",
        array: true,
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
          value: defaultModel,
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
        oneOfPayloadKinds: ["ProposedEntity"],
        name: "proposedEntity",
        required: true,
        array: false,
      },
    ],
    outputs: [
      {
        payloadKind: "Entity",
        name: "persistedEntity",
        array: false,
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
    ],
    outputs: [
      {
        payloadKind: "Entity",
        name: "fileEntity",
        array: false,
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
    ],
    outputs: [
      {
        payloadKind: "ProposedEntity",
        name: "proposedEntities",
        array: true,
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
          value: defaultModel,
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
      },
    ],
  },
} as const satisfies Record<ActionDefinitionId, DeepReadOnly<ActionDefinition>>;

export const actionDefinitions = actionDefinitionsAsConst as unknown as Record<
  ActionDefinitionId,
  ActionDefinition
>;

export type InputNameForAction<
  T extends keyof typeof actionDefinitionsAsConst,
> = (typeof actionDefinitionsAsConst)[T]["inputs"][number]["name"];

export type OutputNameForAction<
  T extends keyof typeof actionDefinitionsAsConst,
> = (typeof actionDefinitionsAsConst)[T]["outputs"][number]["name"];

export type InputPayloadKindForAction<
  T extends ActionDefinitionId,
  N extends InputNameForAction<T>,
> = Extract<
  (typeof actionDefinitionsAsConst)[T]["inputs"][number],
  { name: N }
>["oneOfPayloadKinds"][number];

type InputPayloadType<
  T extends ActionDefinitionId,
  N extends InputNameForAction<T>,
> =
  Extract<
    (typeof actionDefinitionsAsConst)[T]["inputs"][number],
    { name: N }
  > extends { required: true; array: true }
    ? PayloadKindValues[InputPayloadKindForAction<T, N>][]
    : Extract<
          (typeof actionDefinitionsAsConst)[T]["inputs"][number],
          { name: N }
        > extends { required: false; array: true }
      ? PayloadKindValues[InputPayloadKindForAction<T, N>][] | undefined
      : Extract<
            (typeof actionDefinitionsAsConst)[T]["inputs"][number],
            { name: N }
          > extends { required: true; array: false }
        ? PayloadKindValues[InputPayloadKindForAction<T, N>]
        : PayloadKindValues[InputPayloadKindForAction<T, N>] | undefined;

type SimplifiedActionInputsObject<T extends ActionDefinitionId> = {
  [N in InputNameForAction<T>]: InputPayloadType<T, N>;
};

export const getSimplifiedActionInputs = <
  T extends ActionDefinitionId,
>(params: {
  inputs: StepInput[];
  actionType: T;
}): SimplifiedActionInputsObject<T> => {
  const { inputs } = params;

  return inputs.reduce((acc, input) => {
    const inputName = input.inputName as InputNameForAction<T>;

    acc[inputName] = input.payload.value as InputPayloadType<
      T,
      typeof inputName
    >;

    return acc;
  }, {} as SimplifiedActionInputsObject<T>);
};
