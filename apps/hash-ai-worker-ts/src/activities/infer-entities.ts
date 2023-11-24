import { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { AccountId, Entity, Subgraph } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import {
  MutationInferEntitiesArgs,
  ProposedEntity,
} from "../graphql/api-types.gen";
import {
  createFunctions,
  FunctionName,
} from "./infer-entities/create-functions";
import {
  DereferencedEntityType,
  dereferenceEntityType,
} from "./infer-entities/dereference-entity-type";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemMessage: OpenAI.ChatCompletionSystemMessageParam = {
  role: "system",
  content: dedent(`
    You are an Entity Inference Assistant. 
    The user provides you with a text input, from which you infer entities for creation. 
    You create the entities by calling the provided function, which specifies the schemas of entities you may create. 
    Each entity should be given a unique numerical identifier as their 'entityId' property. 
    Some entities require sourceEntityId and targetEntityId properties 
      – these are links between other entities, and sourceEntityId and targetEntityId 
        and must correspond to the entityId of other entities you create. 
        The schema of the source entity will show which links are valid for it, under the 'links' field. 
    The provided user text is your only source of information, so make sure to extract as much information as possible,
    and do not rely on other information about the entities in question you may know. 
    Empty properties should be left out. 
    Pay close attention to the JSON Schema of each entity to create! 
    Please do not add any properties which are not listed in the schema, 
    but DO try and fill out as many of the properties in the schema as possible, 
    if you can find any relevant information in the text. 
    The entities you create must be suitable for the schema chosen 
    – ignore any entities in the provided text which do not have an appropriate schema to use. 
    Make sure you attempt to create entities of all the provided types, if there is data to do so!"
  `),
};

export type InferEntitiesCallerParams = {
  authentication: {
    actorId: AccountId;
  };
  userArguments: MutationInferEntitiesArgs;
};

export const inferEntities = async ({
  authentication,
  graphApiClient,
  userArguments,
}: InferEntitiesCallerParams & { graphApiClient: GraphApi }): Promise<
  Status<Entity[]>
> => {
  const {
    entityTypeIds,
    maxTokens,
    model,
    temperature,
    textInput,
    validation: _validation,
  } = userArguments;

  const { data: entityTypesSubgraph } =
    await graphApiClient.getEntityTypesByQuery(authentication.actorId, {
      filter: {
        any: entityTypeIds.map((entityTypeId) => ({
          equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
        })),
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    });

  const entityTypes: { isLink: boolean; schema: DereferencedEntityType }[] =
    entityTypeIds.map((entityTypeId) =>
      dereferenceEntityType(entityTypeId, entityTypesSubgraph as Subgraph),
    );

  const functions = createFunctions(entityTypes);

  const openApiPayload: OpenAI.ChatCompletionCreateParams = {
    max_tokens: maxTokens,
    messages: [
      systemMessage,
      {
        role: "user",
        content: textInput,
      },
    ],
    model,
    response_format: { type: "json_object" },
    temperature,
    tools: functions,
  };

  const data = await openai.chat.completions.create(openApiPayload);

  const response = data.choices[0];

  if (!response) {
    // @todo better error handling in case unauthenticated, network timeout, etc
    throw new Error("No response from OpenAI API.");
  }

  const { finish_reason, message } = response;

  const functionName = message.function_call?.name as
    | FunctionName
    | "unexpected_string" // account for possible hallucinated function names
    | undefined;

  switch (finish_reason) {
    case "stop":
      return {
        code: StatusCode.Unknown,
        contents: [],
        message: `OpenAI API returned 'stop' finish reason, with message: ${
          message.content ?? "no message"
        }`,
      };
    case "length":
      return {
        code: StatusCode.ResourceExhausted,
        contents: [],
        message:
          "The maximum amount of tokens was reached before the model returned a completion.",
      };
    case "content_filter":
      return {
        code: StatusCode.InvalidArgument,
        contents: [],
        message: `The content filter was triggered`,
      };
    case "function_call":
      if (!functionName) {
        return {
          code: StatusCode.Internal,
          contents: [],
          message: `OpenAI API returned 'function_call' finish reason, but no function name.`,
        };
      }
      if (functionName === "could_not_infer_entities") {
        return {
          code: StatusCode.InvalidArgument,
          contents: [],
          message: `No entities among types ${entityTypeIds.join(
            ", ",
          )} could be inferred from the provided text`,
        };
      } else if (functionName === "create_entities") {
        if (message.tool_calls && message.tool_calls.length > 1) {
          return {
            code: StatusCode.Internal,
            contents: [],
            message: `OpenAI API returned 'function_call' finish reason, but more than one tool call was provided in message.tool_calls.`,
          };
        }

        const modelProvidedArgument =
          message.tool_calls?.[0]?.function.arguments;
        if (!modelProvidedArgument) {
          return {
            code: StatusCode.Internal,
            contents: [],
            message: `OpenAI API returned 'function_call' finish reason, but no argument was provided in message.tool_calls.`,
          };
        }

        const createdEntitiesMap = JSON.parse(modelProvidedArgument) as Record<
          VersionedUrl,
          ProposedEntity[]
        >;
      }
  }
};
