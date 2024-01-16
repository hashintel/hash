import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  getHashInstanceAdminAccountGroupId,
  isUserHashInstanceAdmin,
} from "@local/hash-backend-utils/hash-instance";
import {
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { getUserServiceUsage } from "@local/hash-backend-utils/service-usage";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferenceModelName,
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountId, Subgraph, Timestamp } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import OpenAI from "openai";

import { createInferenceUsageRecord } from "./infer-entities/create-inference-usage-record";
import {
  DereferencedEntityType,
  dereferenceEntityType,
} from "./infer-entities/dereference-entity-type";
import { inferEntitySummaries } from "./infer-entities/infer-entity-summaries";
import {
  InferenceState,
  PermittedOpenAiModel,
} from "./infer-entities/inference-types";
import { log } from "./infer-entities/log";
import { persistEntities } from "./infer-entities/persist-entities";
import { stringify } from "./infer-entities/stringify";

/**
 * A map of the API consumer-facing model names to the values provided to OpenAI.
 * Allows for using preview models before they take over the general alias.
 */
const modelAliasToSpecificModel = {
  "gpt-3.5-turbo": "gpt-3.5-turbo-1106", // bigger context window, will be the resolved value for gpt-3.5-turbo from 11 Dec 2023
  "gpt-4-turbo": "gpt-4-1106-preview", // 'gpt-4-turbo' is not a valid model name in the OpenAI API yet, it's in preview only
  "gpt-4": "gpt-4", // this points to the latest available anyway as of 6 Dec 2023
} as const satisfies Record<InferenceModelName, PermittedOpenAiModel>;

const systemMessage: OpenAI.ChatCompletionSystemMessageParam = {
  role: "system",
  content: dedent(`
    You are an Entity Inference Assistant. The user provides you with a text input, from which you infer entities for creation. 
    Each created entity should be given a unique numerical identifier as their 'entityId' property. 
    Some entities require sourceEntityId and targetEntityId properties – these are links between other entities, 
      and sourceEntityId and targetEntityId must correspond to the entityId of other entities you create.
      The schema of the source entity will show which links are valid for it, under the 'links' field. 
    The provided user text is your only source of information, so make sure to extract as much information as possible, 
      and do not rely on other information about the entities in question you may know. 
    The entities you create must be suitable for the schema chosen 
      – ignore any entities in the provided text which do not have an appropriate schema to use. 
      The keys of the entities 'properties' objects are URLs which end in a trailing slash. This is intentional –
      please do not omit the trailing slash.
    The user may respond advising you that some proposed entities already exist, and give you a new string identifier for them,
      as well as their existing properties. You can then call update_entities instead to update the relevant entities, 
      making sure that you retain any useful information in the existing properties, augmenting it with what you have inferred. 
    The more entities you infer, the happier the user will be!
    Make sure you attempt to create entities of all the provided types, if there is data to do so!
    The user has requested that you fill out as many properties as possible, so please do so. Do not optimise for short responses.
  `),
};

const usageCostLimit = {
  admin: {
    day: 100,
    month: 500,
  },
  user: {
    day: 10,
    month: 50,
  },
};

/**
 * Infer and create entities of the requested types from the provided text input.
 *
 * @param authentication should belong to the user making the request
 * @param requestUuid a unique request id that will be assigned to the workflow and used in logs
 */
export const inferEntities = async ({
  authentication: userAuthenticationInfo,
  graphApiClient,
  requestUuid,
  userArguments,
}: InferEntitiesCallerParams & {
  graphApiClient: GraphApi;
}): Promise<InferEntitiesReturn> => {
  /** Check if the user has exceeded their usage limits */
  const now = new Date();

  const userServiceUsage = await getUserServiceUsage(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    {
      userAccountId: userAuthenticationInfo.actorId,
      decisionTimeInterval: {
        start: {
          kind: "inclusive",
          limit: new Date(
            now.valueOf() - 1000 * 60 * 60 * 24 * 30,
          ).toISOString() as Timestamp,
        },
        end: { kind: "inclusive", limit: now.toISOString() as Timestamp },
      },
    },
  );

  const { lastDaysCost, lastThirtyDaysCost } = userServiceUsage.reduce(
    (acc, usageRecord) => {
      acc.lastDaysCost += usageRecord.last24hoursTotalCostInUsd;
      acc.lastThirtyDaysCost += usageRecord.totalCostInUsd;
      return acc;
    },
    { lastDaysCost: 0, lastThirtyDaysCost: 0 },
  );

  const isUserAdmin = await isUserHashInstanceAdmin(
    { graphApi: graphApiClient },
    userAuthenticationInfo,
    { userAccountId: userAuthenticationInfo.actorId },
  );

  const { day: dayLimit, month: monthLimit } =
    usageCostLimit[isUserAdmin ? "admin" : "user"];

  if (lastDaysCost >= dayLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your daily usage limit of ${dayLimit}.`,
    };
  }
  if (lastThirtyDaysCost >= monthLimit) {
    return {
      code: StatusCode.ResourceExhausted,
      contents: [],
      message: `You have exceeded your monthly usage limit of ${monthLimit}.`,
    };
  }
  /** Usage limit check complete */

  const {
    createAs,
    entityTypeIds,
    maxTokens,
    model: modelAlias,
    ownedById,
    sourceTitle,
    sourceUrl,
    temperature,
    textInput,
  } = userArguments;

  /** Check if the user has entity creation permissions in the requested web */
  const userHasPermission = await graphApiClient
    .checkWebPermission(
      userAuthenticationInfo.actorId,
      ownedById,
      "create_entity",
    )
    .then(({ data }) => data.has_permission);

  if (!userHasPermission) {
    return {
      code: StatusCode.PermissionDenied,
      contents: [],
      message: `You do not have permission to create entities in requested web with id ${ownedById}.`,
    };
  }

  /** Fetch the AI Assistant actor and check if it has permission to create entities in the requested web */
  let aiAssistantAccountId: AccountId;
  try {
    aiAssistantAccountId = await getMachineActorId(
      { graphApi: graphApiClient },
      userAuthenticationInfo,
      { identifier: "hash-ai" },
    );
  } catch {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: "Could not retrieve hash-ai entity",
    };
  }

  const aiAssistantHasPermission = await graphApiClient
    .checkWebPermission(aiAssistantAccountId, ownedById, "update_entity")
    .then((resp) => resp.data.has_permission);

  if (!aiAssistantHasPermission) {
    /** The AI Assistant does not have permission in the requested web, use the web-scoped bot to grant it */
    const webMachineActorId = await getWebMachineActorId(
      { graphApi: graphApiClient },
      userAuthenticationInfo,
      {
        ownedById,
      },
    );

    await graphApiClient.modifyWebAuthorizationRelationships(
      webMachineActorId,
      [
        {
          operation: "create",
          resource: ownedById,
          relationAndSubject: {
            subject: {
              kind: "account",
              subjectId: aiAssistantAccountId,
            },
            relation: "entityCreator",
          },
        },
        {
          operation: "create",
          resource: ownedById,
          relationAndSubject: {
            subject: {
              kind: "account",
              subjectId: aiAssistantAccountId,
            },
            relation: "entityEditor",
          },
        },
      ],
    );
  }
  /** The AI Assistant has permission in the specified web, proceed with inference */

  /** Fetch the full schemas for the requested entity types */
  const entityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  > = {};

  try {
    const { data: entityTypesSubgraph } =
      await graphApiClient.getEntityTypesByQuery(aiAssistantAccountId, {
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
        includeDrafts: false,
      });

    for (const entityTypeId of entityTypeIds) {
      entityTypes[entityTypeId] = dereferenceEntityType(
        entityTypeId,
        entityTypesSubgraph as Subgraph,
      );
    }
  } catch (err) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Error retrieving and dereferencing entity types: ${
        (err as Error).message
      }`,
    };
  }

  const model = modelAliasToSpecificModel[modelAlias];

  const unusableTypeIds = entityTypeIds.filter((entityTypeId) => {
    const details = entityTypes[entityTypeId];
    if (!details) {
      return true;
    }

    const { isLink } = details;

    if (!isLink) {
      /**
       * If it's not a link we assume it can be satisfied.
       * @todo consider checking if it has required links (minItems > 1) which cannot be satisfied
       */
      return false;
    }

    /**
     * If this is a link type, only search for it if it can be used, given the other types of entities being sought
     */
    const linkCanBeSatisfied = Object.values(entityTypes).some((option) =>
      typedEntries(option.schema.links ?? {}).some(
        ([linkTypeId, targetSchema]) =>
          // It must exist as a potential link on at least one of the other entity types being sought...
          linkTypeId === entityTypeId &&
          // ...and that link must not have destination constraints which exclude the link type
          !(
            "oneOf" in targetSchema.items &&
            !targetSchema.items.oneOf.some(
              (targetOption) => entityTypes[targetOption.$ref],
            )
          ),
      ),
    );

    return !linkCanBeSatisfied;
  });

  for (const unusableTypeId of unusableTypeIds) {
    delete entityTypes[unusableTypeId];
  }

  const inferenceState: InferenceState = {
    iterationCount: 1,
    inProgressEntityIds: [],
    proposedEntitySummaries: [],
    resultsByTemporaryId: {},
    usage: [],
  };

  /**
   * Inference step 1: get a list of entities that can be inferred from the input text, without property details
   *
   * The two-step approach is intended to:
   * 1. Allow for inferring more entities than completion token limits would allow for if all entity details were inferred in one step
   * 2. Split the task into steps to encourage the model to infer as many entities as possible first, before filling out the details
   *
   * This step may need its own internal iteration if there are very many entities to infer – to be handled inside the inferEntitySummaries function.
   */
  const summariseEntitiesPrompt = dedent(`
    First, let's get a summary of the entities you can infer from the provided text. Please provide a brief description
    of each entity you can infer. It only needs to be long enough to uniquely identify the entity in the text – we'll
    worry about any more details in a future step.
    I'm about to provide you with the content of a website hosted at ${sourceUrl}, titled ${sourceTitle}.
    Pay particular attention to providing responses for entities which are most prominent in the page,
      and any which are mentioned in the title or URL – but include as many other entities as you can find also.
    Here is the website content:
    ${textInput}
    ---WEBSITE CONTENT ENDS---
  
    Your comprehensive list entities of the requested types you are able to infer from the website:
  `);

  const { code, contents, message } = await inferEntitySummaries({
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        systemMessage,
        {
          role: "user",
          content: summariseEntitiesPrompt,
        },
      ],
      model,
      temperature,
    },
    entityTypes,
    inferenceState,
    providedOrRerequestedEntityTypes: new Set(),
  });

  log(`Inference state after entity summaries: ${stringify(inferenceState)}`);

  if (code !== StatusCode.Ok) {
    log(
      `Returning early after error inferring entity summaries: ${
        message ?? "no message provided"
      }`,
    );
    if (contents[0]?.usage) {
      await createInferenceUsageRecord({
        aiAssistantAccountId,
        graphApiClient,
        modelName: model,
        usage: contents[0]?.usage,
        userAccountId: userAuthenticationInfo.actorId,
      });
    }

    return { code, contents: [], message };
  }

  /**
   * Step 2: Ask the model to create (or update) the entities inferred in step 1
   *
   * The function should handle pagination internally to keep within completion token limits.
   */

  /**
   * We want to leave links until the end, since they will depend on entities processed earlier
   * This assumes that links do not link to other links.
   */
  inferenceState.proposedEntitySummaries.sort((a, b) => {
    const aIsLink = !!a.sourceEntityId;
    const bIsLink = !!b.sourceEntityId;

    if ((aIsLink && bIsLink) || (!aIsLink && !bIsLink)) {
      return 0;
    }
    if (aIsLink && !bIsLink) {
      return 1;
    }
    return -1;
  });

  const persistEntitiesPrompt = dedent(`
    The website page title is ${sourceTitle}, hosted at ${sourceUrl}. Its content is as follows:
    ${textInput}
    ---WEBSITE CONTENT ENDS---
    
    You already provided a summary of the entities you can infer from the website. Here it is:
    ${JSON.stringify(Object.values(inferenceState.proposedEntitySummaries))}
  `);

  const promptMessages = [
    systemMessage,
    {
      role: "user",
      content: persistEntitiesPrompt,
    } as const,
  ];

  const response = await persistEntities({
    authentication: { machineActorId: aiAssistantAccountId },
    completionPayload: {
      max_tokens: maxTokens,
      messages: [
        systemMessage,
        {
          role: "user",
          content: persistEntitiesPrompt,
        },
      ],
      model,
      temperature,
    },
    createAs,
    entityTypes,
    graphApiClient,
    inferenceState: {
      ...inferenceState,
      iterationCount: inferenceState.iterationCount + 1,
    },
    originalPromptMessages: promptMessages,
    ownedById,
    requestingUserAccountId: userAuthenticationInfo.actorId,
    requestUuid,
  });

  if (response.contents[0]?.usage) {
    const usageRecordMetadata = await createInferenceUsageRecord({
      aiAssistantAccountId,
      graphApiClient,
      modelName: model,
      usage: response.contents[0].usage,
      userAccountId: userAuthenticationInfo.actorId,
    });

    const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
      { graphApi: graphApiClient },
      { actorId: aiAssistantAccountId },
    );

    for (const entityResult of response.contents[0].results) {
      if (entityResult.status === "success") {
        await graphApiClient.createEntity(aiAssistantAccountId, {
          draft: false,
          properties: {},
          ownedById: userAuthenticationInfo.actorId,
          entityTypeId:
            entityResult.operation === "create"
              ? systemLinkEntityTypes.created.linkEntityTypeId
              : systemLinkEntityTypes.updated.linkEntityTypeId,
          linkData: {
            leftEntityId: usageRecordMetadata.recordId.entityId,
            rightEntityId: entityResult.entity.metadata.recordId.entityId,
          },
          relationships: [
            {
              relation: "administrator",
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
            },
            {
              relation: "viewer",
              subject: {
                kind: "account",
                subjectId: userAuthenticationInfo.actorId,
              },
            },
            {
              relation: "viewer",
              subject: {
                kind: "accountGroup",
                subjectId: hashInstanceAdminGroupId,
              },
            },
          ],
        });
      }
    }
  }

  return response;
};
