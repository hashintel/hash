import { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/temporal-types";
import { Subgraph } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import { createEntities } from "./infer-entities/create-entities";
import {
  DereferencedEntityType,
  dereferenceEntityType,
} from "./infer-entities/dereference-entity-type";
import {
  FunctionName,
  generateFunctions,
  ProposedEntitiesByType,
  validateProposedEntitiesByType,
} from "./infer-entities/generate-functions";

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

/**
 * Infer and create entities of the requested types from the provided text input.
 * @param authentication information on the user making the request
 * @param graphApiClient
 * @param userArguments
 */
export const inferEntities = async ({
  authentication,
  graphApiClient,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
}): Promise<InferEntitiesReturn> => {
  const {
    entityTypeIds,
    maxTokens,
    model,
    ownedById,
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

  const entityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  > = {};

  for (const entityTypeId of entityTypeIds) {
    entityTypes[entityTypeId] = dereferenceEntityType(
      entityTypeId,
      entityTypesSubgraph as Subgraph,
    );
  }

  const functions = generateFunctions(Object.values(entityTypes));

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
    throw new Error("No response from AI Model.");
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
        message: `AI Model returned 'stop' finish reason, with message: ${
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
    case "tool_calls":
      if (!functionName) {
        return {
          code: StatusCode.Internal,
          contents: [],
          message: `AI Model returned 'function_call' finish reason, but no function name.`,
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
            message: `AI Model returned 'function_call' finish reason, but more than one tool call was provided in message.tool_calls.`,
          };
        }

        const modelProvidedArgument =
          message.tool_calls?.[0]?.function.arguments;
        if (!modelProvidedArgument) {
          return {
            code: StatusCode.Internal,
            contents: [],
            message: `AI Model returned 'function_call' finish reason, but no argument was provided in message.tool_calls.`,
          };
        }

        let proposedEntitiesByType: ProposedEntitiesByType;
        try {
          proposedEntitiesByType = JSON.parse(
            modelProvidedArgument,
          ) as ProposedEntitiesByType;
          validateProposedEntitiesByType(proposedEntitiesByType);
        } catch (err) {
          return {
            code: StatusCode.Internal,
            contents: [],
            message: `AI Model called create_entities with invalid argument: ${
              (err as Error).message
            }`,
          };
        }

        const providedEntityTypes = Object.keys(proposedEntitiesByType);
        const notRequestedTypes = providedEntityTypes.filter(
          (providedEntityTypeId) =>
            !entityTypeIds.includes(providedEntityTypeId as VersionedUrl),
        );
        if (notRequestedTypes.length > 0) {
          return {
            code: StatusCode.Internal,
            contents: [],
            message: `AI Model provided entities of types ${notRequestedTypes.join(
              ", ",
            )}, which were not requested.`,
          };
        }

        const { createdEntities, creationFailures } = await createEntities({
          actorId: authentication.actorId,
          graphApiClient,
          ownedById,
          proposedEntitiesByType,
          requestedEntityTypes: entityTypes,
        });

        // @todo go back to the AI to ask it to fix creation failures

        return {
          code: StatusCode.Ok,
          contents: createdEntities,
          message: `Successfully created ${createdEntities.length} entities, with ${creationFailures.length} failures.`,
        };
      }
      break;
  }

  return {
    code: StatusCode.Internal,
    contents: [],
    message: `AI Model returned unhandled finish reason: ${finish_reason}`,
  };
};
