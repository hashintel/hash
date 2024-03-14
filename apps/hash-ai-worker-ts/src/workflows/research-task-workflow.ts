import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  EntityWithSources,
  ResearchTaskWorkflowParams,
  ResearchTaskWorkflowResponse,
} from "@local/hash-isomorphic-utils/research-task-types";
import { StatusCode } from "@local/status";
import type { ActivityInterfaceFor } from "@temporalio/workflow";

import type { createAiActivities, createGraphActivities } from "../activities";
import type {
  InferenceState,
  PermittedOpenAiModel,
  WebPage,
} from "../activities/infer-entities/inference-types";

type AiActivities = ActivityInterfaceFor<ReturnType<typeof createAiActivities>>;

type GraphActivities = ActivityInterfaceFor<
  ReturnType<typeof createGraphActivities>
>;

const maximumNumberOfWebSearchResults = 3;

/** @todo: allow for overriding this */
const model: PermittedOpenAiModel = "gpt-4-1106-preview";

export const createResearchTaskWorkflow =
  (ctx: { aiActivities: AiActivities; graphActivities: GraphActivities }) =>
  async (
    params: ResearchTaskWorkflowParams,
  ): Promise<ResearchTaskWorkflowResponse> => {
    const { aiActivities, graphActivities } = ctx;

    const { prompt, userAuthentication, webOwnerId, entityTypeIds } = params;

    /** Check if the user has exceeded their usage limits */

    const userExceedServiceUsageLimitReason =
      await aiActivities.userExceededServiceUsageLimitActivity({
        userAccountId: userAuthentication.actorId,
      });

    if (userExceedServiceUsageLimitReason.code !== StatusCode.Ok) {
      return userExceedServiceUsageLimitReason;
    }

    const globalInferenceState: InferenceState = {
      iterationCount: 1,
      inProgressEntityIds: [],
      proposedEntitySummaries: [],
      proposedEntityCreationsByType: {},
      resultsByTemporaryId: {},
      usage: [],
    };

    /**
     * @todo: rather than use the prompt directly, use an LLM to devise
     * potentially multiple web queries for the next step.
     */

    const webSearchResults = await aiActivities.getWebSearchResultsActivity({
      query: prompt,
    });

    const aiAssistantAccountId =
      await aiActivities.getAiAssistantAccountIdActivity({
        authentication: userAuthentication,
        grantCreatePermissionForWeb: webOwnerId,
      });

    if (!aiAssistantAccountId) {
      return {
        code: StatusCode.Internal,
        contents: [],
        message: "Could not retrieve hash-ai entity",
      };
    }

    const entityTypes = await aiActivities.getDereferencedEntityTypesActivity({
      entityTypeIds,
      actorId: aiAssistantAccountId,
    });

    /**
     * For each web search result, infer the relevant entities from the website.
     */
    const proposedEntitiesStatuses = await Promise.all(
      webSearchResults
        .slice(0, maximumNumberOfWebSearchResults)
        .map(async ({ url, title }) => {
          const webPageTextContent =
            await aiActivities.getTextFromWebPageActivity({ url });

          const webPage: WebPage = {
            title,
            url,
            textContent: webPageTextContent,
          };

          /**
           * @todo: consider unifying the inference state between the web-pages,
           * so that usage is tracked in a single place
           */
          const webPageInferenceState: InferenceState = {
            iterationCount: 1,
            inProgressEntityIds: [],
            proposedEntitySummaries: [],
            proposedEntityCreationsByType: {},
            resultsByTemporaryId: {},
            usage: [],
          };

          const status = await aiActivities.inferEntitiesFromWebPageActivity({
            webPage,
            relevantEntitiesPrompt: prompt,
            validationActorId: userAuthentication.actorId,
            model,
            entityTypes,
            inferenceState: webPageInferenceState,
          });

          return { status, webPage };
        }),
    );

    /**
     * @todo: consider deduplicating proposed entities based on their vector similarity
     * before trying to create them.
     */

    const createEntitiesReturns = await Promise.all(
      proposedEntitiesStatuses.map(async ({ status, webPage }) => {
        const webPageInferenceState = status.contents[0]!;

        const response = await aiActivities.createEntitiesActivity({
          actorId: aiAssistantAccountId,
          createAsDraft: true,
          inferenceState: webPageInferenceState,
          proposedEntitiesByType:
            webPageInferenceState.proposedEntityCreationsByType,
          requestedEntityTypes: entityTypes,
          ownedById: webOwnerId,
        });

        globalInferenceState.iterationCount +=
          webPageInferenceState.iterationCount;
        globalInferenceState.usage.push(...webPageInferenceState.usage);

        return { ...response, webPage };
      }),
    );

    const createdDraftEntities = createEntitiesReturns
      .flatMap(({ creationSuccesses, webPage }) =>
        Object.values(creationSuccesses).map(({ entity }) => ({
          entity,
          sourceWebPages: [{ title: webPage.title, url: webPage.url }],
        })),
      )
      .reduce((acc, entry) => {
        const existingEntryIndex = acc.findIndex(
          (existingEntry) =>
            existingEntry.entity.metadata.recordId.entityId ===
            entry.entity.metadata.recordId.entityId,
        );
        if (existingEntryIndex !== -1) {
          acc[existingEntryIndex]!.sourceWebPages.push(...entry.sourceWebPages);
        } else {
          acc.push(entry);
        }
        return acc;
      }, [] as EntityWithSources[]);

    const unchangedExistingEntities = createEntitiesReturns
      .flatMap(({ unchangedEntities, webPage }) =>
        Object.values(unchangedEntities).map(({ entity }) => ({
          entity,
          sourceWebPages: [{ title: webPage.title, url: webPage.url }],
        })),
      )
      .reduce((acc, entry) => {
        const existingEntryIndex = acc.findIndex(
          (existingEntry) =>
            existingEntry.entity.metadata.recordId.entityId ===
            entry.entity.metadata.recordId.entityId,
        );
        if (existingEntryIndex !== -1) {
          acc[existingEntryIndex]!.sourceWebPages.push(...entry.sourceWebPages);
        } else if (
          !createdDraftEntities.some(
            (createdEntity) =>
              createdEntity.entity.metadata.recordId.entityId ===
              entry.entity.metadata.recordId.entityId,
          )
        ) {
          acc.push(entry);
        }
        return acc;
      }, [] as EntityWithSources[]);

    const { usage } = globalInferenceState;

    const usageRecordMetadata =
      await aiActivities.createInferenceUsageRecordActivity({
        aiAssistantAccountId,
        modelName: model,
        usage,
        userAccountId: userAuthentication.actorId,
      });

    const hashInstanceAdminGroupId =
      await graphActivities.getHashInstanceAdminAccountGroupId({
        actorId: aiAssistantAccountId,
      });

    /**
     * @todo: persist the research task in the graph alongside relevant metadata
     * (the prompt used, the web pages scraped, the time it took to complete, etc.)
     */

    await Promise.all(
      createdDraftEntities.map(({ entity }) =>
        graphActivities.createEntity(aiAssistantAccountId, {
          draft: false,
          properties: {},
          ownedById: userAuthentication.actorId,
          entityTypeIds: [systemLinkEntityTypes.created.linkEntityTypeId],
          linkData: {
            leftEntityId: usageRecordMetadata.recordId.entityId,
            rightEntityId: entity.metadata.recordId.entityId,
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
                subjectId: userAuthentication.actorId,
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
        }),
      ),
    );

    return {
      code: StatusCode.Ok,
      contents: [{ createdDraftEntities, unchangedExistingEntities }],
    };
  };
