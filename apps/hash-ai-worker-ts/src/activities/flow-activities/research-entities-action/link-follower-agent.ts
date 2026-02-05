import type { SourceProvenance, Url } from "@blockprotocol/type-system";
import { currentTimestamp } from "@blockprotocol/type-system";
import { getStorageProvider } from "@local/hash-backend-utils/flows/payload-storage";
import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { MetadataMode } from "llamaindex";

import { getWebPageActivity } from "../../get-web-page-activity.js";
import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import {
  getFlowContext,
  getProvidedFileByUrl,
} from "../../shared/get-flow-context.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { Claim } from "../shared/claims.js";
import { inferSummariesThenClaimsFromText } from "../shared/infer-summaries-then-claims-from-text.js";
import type { LocalEntitySummary } from "../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Link } from "./link-follower-agent/choose-relevant-links-from-content.js";
import { chooseRelevantLinksFromContent } from "./link-follower-agent/choose-relevant-links-from-content.js";
import { filterAndRankTextChunksAgent } from "./link-follower-agent/filter-and-rank-text-chunks-agent.js";
import { getLinkFollowerNextToolCalls } from "./link-follower-agent/get-link-follower-next-tool-calls.js";
import { indexPdfFile } from "./link-follower-agent/llama-index/index-pdf-file.js";
import { areUrlsEqual } from "./shared/are-urls-equal.js";
import { checkIfWorkerShouldStop } from "./shared/check-if-worker-should-stop.js";
import { deduplicateEntities } from "./shared/deduplicate-entities.js";

type ResourceToExplore = {
  url: Url;
  descriptionOfExpectedContent: string;
  exampleOfExpectedContent: string;
  goal: string;
  reason: string;
};

type LinkFollowerAgentInput = {
  /**
   * Existing entities which we are seeking more information on,
   * whether in their own right or to be linked to from other entities.
   */
  existingEntitiesOfInterest: LocalEntitySummary[];
  /**
   * The resource to start the exploration at
   */
  initialResource: ResourceToExplore;
  /**
   * The goal of the exploration
   */
  goal: string;
  /**
   * The types of entities which are sought as part of the research task.
   */
  entityTypes: DereferencedEntityType[];
};

const isContentAtUrlPdfFile = async (params: { url: string }) => {
  const { url } = params;

  try {
    /**
     * HASH files are accessed via presigned GET URLs, and therefore we can't use a HEAD request.
     * This serves the same function of having the Content-Type header available without downloading the whole file.
     */
    const urlFirstByteFetch = await fetch(url, {
      headers: {
        Range: "bytes=0-0",
      },
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    /**
     * Only check the content type of the URL if the request was successful.
     *
     * This may be because the web page requires an authenticated user to access it.
     */
    if (urlFirstByteFetch.ok) {
      const contentType = urlFirstByteFetch.headers.get("Content-Type");

      if (contentType && contentType.includes("application/pdf")) {
        return true;
      }
    }
  } catch (error) {
    logger.error(
      `Error encountered when checking if content at URL ${url} is a PDF file: ${stringify(
        error,
      )}`,
    );
  }
  return false;
};

const exploreResource = async (params: {
  input: LinkFollowerAgentInput;
  resource: ResourceToExplore;
  workerIdentifiers: WorkerIdentifiers;
}): Promise<
  | {
      status: "ok";
      resource: ResourceToExplore;
      possibleNextLinks: Link[];
      inferredClaims: Claim[];
      inferredEntitySummaries: LocalEntitySummary[];
    }
  | {
      status: "not-explored";
      resource: ResourceToExplore;
      reason: string;
    }
> => {
  const { resource, input, workerIdentifiers } = params;

  logger.debug(`Exploring resource at URL: ${resource.url}`);

  const { stepId, dataSources } = await getFlowContext();

  const hashEntityForFile = await getProvidedFileByUrl(resource.url);

  let content = "";
  let resourceTitle: string | undefined =
    hashEntityForFile?.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want empty strings
    ] ||
    hashEntityForFile?.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"
    ];

  let urlForDownload = resource.url;

  if (hashEntityForFile) {
    /**
     * If this is a file stored in HASH, we need a signed URL to be able to access it.
     * The signed URL is (a) temporary and (b) not user-facing, so we only generate and use it here,
     * and otherwise use the proxy URL stored on the entity itself in logs and provenance records.
     */
    const storageKey =
      hashEntityForFile.properties[
        "https://hash.ai/@h/types/property-type/file-storage-key/"
      ];

    if (storageKey) {
      urlForDownload = await getStorageProvider().presignDownload({
        entity: hashEntityForFile,
        expiresInSeconds: 60 * 60,
        key: storageKey,
      });
    }
  } else if (!dataSources.internetAccess.enabled) {
    return {
      status: "not-explored",
      resource,
      reason:
        "Public internet access is disabled – you provided a URL to the public web.",
    };
  }

  const isResourcePdfFile = await isContentAtUrlPdfFile({
    url: urlForDownload,
  });

  if (isResourcePdfFile) {
    const { vectorStoreIndex } = await indexPdfFile({
      fileUrl: urlForDownload,
    });

    if (!resourceTitle) {
      // If we don't already have a filename, use the end of the URL (without any query params)

      /**
       * @todo: extract the title from the PDF file using a pdf parsing package or an LLM.
       */
      try {
        const urlObject = new URL(resource.url);

        resourceTitle = urlObject.pathname.split("/").pop();
      } catch {
        // Do nothing – if the URL was invalid the isResourcePdfFile would have failed anyway
      }
    }

    const queryEngine = vectorStoreIndex.asQueryEngine({
      retriever: vectorStoreIndex.asRetriever({
        // Get the 15 most similar nodes
        similarityTopK: 15,
      }),
    });

    logProgress([
      {
        recordedAt: new Date().toISOString(),
        stepId,
        type: "ViewedFile",
        file: {
          title: resourceTitle ?? resource.url,
          url: resource.url,
        },
        explanation: resource.reason,
        ...workerIdentifiers,
      },
    ]);

    const query = dedent(`
      Description: ${resource.descriptionOfExpectedContent}
      Example text: ${resource.exampleOfExpectedContent}
    `);

    logger.debug(`Querying PDF file with query: ${query}`);

    const { sourceNodes } = await queryEngine.query({
      query,
    });

    const textChunks = sourceNodes?.map(({ node }) =>
      node.getContent(MetadataMode.NONE),
    );

    if (!textChunks || textChunks.length === 0) {
      return {
        status: "not-explored",
        resource,
        reason: "No relevant sections found in the PDF.",
      };
    }

    logger.debug(
      `Vector DB query returned ${textChunks.length} chunks: ${stringify(
        textChunks,
      )}`,
    );

    const filteredAndRankedTextChunksResponse =
      await filterAndRankTextChunksAgent({
        description: resource.descriptionOfExpectedContent,
        exampleText: resource.exampleOfExpectedContent,
        textChunks,
      });

    if (
      filteredAndRankedTextChunksResponse.status !== "ok" ||
      filteredAndRankedTextChunksResponse.orderedRelevantTextChunks.length === 0
    ) {
      /**
       * @todo: consider improving the error reporting of this, by handling
       * errors encountered in the `filterAndRankTextChunksAgent` method differently
       * to how we're handling no relevant chunks in a valid response.
       */
      if (filteredAndRankedTextChunksResponse.status !== "ok") {
        logger.error(
          `Error encountered when filtering and ranking text chunks: ${stringify(
            filteredAndRankedTextChunksResponse,
          )}`,
        );
      }
      return {
        status: "not-explored",
        reason: "No relevant sections found in the PDF.",
        resource,
      };
    }

    const { orderedRelevantTextChunks } = filteredAndRankedTextChunksResponse;

    logger.debug(
      `Ordered relevant text chunks: ${stringify(orderedRelevantTextChunks)}`,
    );

    content = dedent(`
      Here is a list of the most relevant sections of the PDF file with file URL ${
        resource.url
      }:
      ${orderedRelevantTextChunks
        .map((text, index) => `Relevant section ${index + 1}: ${text}`)
        .join("\n")}
      `);
  } else {
    const webPage = await getWebPageActivity({
      url: resource.url,
      sanitizeForLlm: true,
    });

    const notExploredLog = {
      recordedAt: new Date().toISOString(),
      stepId,
      type: "VisitedWebPage",
      webPage: { url: resource.url, title: "Unknown – could not access" },
      explanation: resource.reason,
      ...workerIdentifiers,
    } as const;

    if ("error" in webPage) {
      logProgress([notExploredLog]);
      return {
        status: "not-explored",
        reason: webPage.error,
        resource,
      };
    } else if (!webPage.htmlContent.trim()) {
      logProgress([notExploredLog]);
      return {
        status: "not-explored",
        reason: "Could not retrieve web page content",
        resource,
      };
    }

    resourceTitle = webPage.title;

    logProgress([
      {
        recordedAt: new Date().toISOString(),
        stepId,
        type: "VisitedWebPage",
        webPage: { url: webPage.url, title: webPage.title },
        explanation: resource.reason,
        ...workerIdentifiers,
      },
    ]);

    content = webPage.htmlContent;
  }

  const { goal, existingEntitiesOfInterest, entityTypes } = input;

  const relevantLinksFromContent = await chooseRelevantLinksFromContent({
    contentUrl: resource.url,
    contentType: isResourcePdfFile ? "text" : "html",
    content,
    goal,
  }).then((response) => {
    if (response.status === "ok") {
      return response.links;
    }

    return [];
  });

  logger.debug(
    `Extracted relevant ${relevantLinksFromContent.length} links from the content of the resource with URL ${resource.url}`,
  );

  const dereferencedEntityTypesById =
    entityTypes.reduce<DereferencedEntityTypesByTypeId>(
      (prev, schema) => ({
        ...prev,
        [schema.$id]: { schema, isLink: false },
      }),
      {},
    );

  const {
    claims: inferredClaimsFromContent,
    entitySummaries: inferredEntitySummariesFromContent,
  } = await inferSummariesThenClaimsFromText({
    existingEntitiesOfInterest,
    text: content,
    url: resource.url,
    contentType: isResourcePdfFile ? "document" : "webpage",
    title: resourceTitle ?? null,
    goal: resource.goal,
    dereferencedEntityTypes: dereferencedEntityTypesById,
    workerIdentifiers,
  });

  logProgress([
    {
      recordedAt: new Date().toISOString(),
      stepId,
      type: "InferredClaimsFromText",
      output: {
        claimCount: inferredClaimsFromContent.length,
        entityCount: inferredEntitySummariesFromContent.length,
        resource: {
          url: resource.url,
          title: resourceTitle,
        },
      },
      ...workerIdentifiers,
    },
  ]);

  const claimSource: SourceProvenance = {
    entityId: hashEntityForFile?.entityId,
    type: isResourcePdfFile ? "document" : "webpage",
    location: {
      uri:
        (hashEntityForFile?.properties[
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
        ] as Url | undefined) ?? resource.url,
      name: resourceTitle,
      /**
       * @todo: generate a description of the resource via an LLM.
       */
      description:
        hashEntityForFile?.properties[
          "https://blockprotocol.org/@blockprotocol/types/property-type/description/"
        ],
    },
    loadedAt: currentTimestamp(),
    /**
     * @todo: extract the authors of the resource via an LLM, if these are specified
     * in teh content.
     */
    authors: undefined,
    /**
     * @todo: extract the publication date and last updated date of the resource
     * from the content via an LLM if it is specified, or in the case of web-pages this may be specified in the
     * HTML headers of the web-page.
     */
    firstPublished: undefined,
    lastUpdated: undefined,
  };

  const inferredClaimsWithSource = inferredClaimsFromContent.map((claim) => ({
    ...claim,
    sources: [...(claim.sources ?? []), claimSource],
  }));

  return {
    status: "ok",
    resource,
    possibleNextLinks: relevantLinksFromContent,
    inferredClaims: inferredClaimsWithSource,
    inferredEntitySummaries: inferredEntitySummariesFromContent,
  };
};

/**
 * An agent which is given a link to start exploring from, and a research goal. Firstly, from the initial link:
 * 1. two parallel tasks are created, each of which gets the link and the goal:
 *   a. extract all the links from the content of the link (dumb logic), and then reduce these to which might be
 * relevant (agent) b. recognize entities from the content (agent) then infer claims about those entities (agents, one
 * per entity)
 * 2. the 'link follower' agent is then given the results of this (claims, entities, possible next links).
 * 3. It decides which, if any, relevant links to follow next, each of which spawn the work described in (1) in
 * parallel, and so on.
 */
export const linkFollowerAgent = async (params: {
  input: LinkFollowerAgentInput;
  workerIdentifiers: WorkerIdentifiers;
}): Promise<
  {
    inferredClaims: Claim[];
    exploredResources: ResourceToExplore[];
    inferredSummaries: LocalEntitySummary[];
    suggestionForNextSteps: string;
  } & ({ status: "ok" } | { status: "error"; message: string })
> => {
  const { input, workerIdentifiers } = params;
  const { initialResource, existingEntitiesOfInterest, goal } = input;

  const exploredResources: ResourceToExplore[] = [];

  let resourcesToExplore: ResourceToExplore[] = [initialResource];
  let possibleNextLinks: Link[] = [];

  let allInferredEntitySummaries: LocalEntitySummary[] = [];
  let allInferredClaims: Claim[] = [];
  let suggestionForNextSteps = "";

  while (resourcesToExplore.length > 0) {
    const entitiesToProvideExplorer = [
      ...allInferredEntitySummaries,
      ...existingEntitiesOfInterest,
    ];

    /**
     * Prior to exploring more resources, check if we should stop.
     */
    const preExploreResourcesStopCheck =
      await checkIfWorkerShouldStop(workerIdentifiers);

    if (preExploreResourcesStopCheck.shouldStop) {
      /**
       * If the activity has been cancelled because the workflow was terminated, this log will have no receiver and won't be picked up.
       * It will be picked up in cases where the workflow continues (e.g. when only this task has been requested to stop).
       */
      logProgress([
        {
          explanation: preExploreResourcesStopCheck.explanation,
          recordedAt: new Date().toISOString(),
          stepId: Context.current().info.activityId,
          type: "WorkerWasStopped",
          ...workerIdentifiers,
        },
      ]);

      return {
        status: "ok",
        inferredClaims: allInferredClaims,
        inferredSummaries: allInferredEntitySummaries,
        suggestionForNextSteps,
        exploredResources,
      };
    }

    const exploredResourcesResponses = await Promise.all(
      resourcesToExplore.map((resource) =>
        exploreResource({
          resource,
          input: {
            ...input,
            existingEntitiesOfInterest: entitiesToProvideExplorer,
          },
          workerIdentifiers,
        }),
      ),
    );

    const inferredClaims: Claim[] = [];
    const inferredEntitySummaries: LocalEntitySummary[] = [];

    for (const response of exploredResourcesResponses) {
      exploredResources.push(response.resource);

      if (response.status === "ok") {
        possibleNextLinks.push(...response.possibleNextLinks);

        inferredClaims.push(...response.inferredClaims);
        inferredEntitySummaries.push(...response.inferredEntitySummaries);
      } else {
        logger.debug(
          `Resource at URL ${response.resource.url} not explored: ${response.reason}`,
        );

        if (resourcesToExplore.length === 1) {
          return {
            status: "error",
            message: `Could not explore the resource at URL ${response.resource.url}: ${response.reason}`,
            inferredClaims: allInferredClaims,
            inferredSummaries: allInferredEntitySummaries,
            suggestionForNextSteps,
            exploredResources,
          };
        }
      }
    }

    if (inferredEntitySummaries.length > 0) {
      if (
        allInferredEntitySummaries.length === 0 &&
        resourcesToExplore.length === 1
      ) {
        /**
         * If we previously haven't encountered any entities, and we only explored
         * a single resource, we can safely assume that any entities inferred
         * are unique and don't require deduplication.
         */
        allInferredEntitySummaries.push(...inferredEntitySummaries);
        allInferredClaims.push(...inferredClaims);
      } else {
        /**
         * Otherwise we need to deduplicate the entities.
         */
        const { duplicates } = await deduplicateEntities({
          entities: [...inferredEntitySummaries, ...allInferredEntitySummaries],
        });

        allInferredEntitySummaries = [
          ...allInferredEntitySummaries,
          ...inferredEntitySummaries,
        ].filter(
          ({ localId }) =>
            !duplicates.some(({ duplicateIds }) =>
              duplicateIds.includes(localId),
            ),
        );

        allInferredClaims = [...allInferredClaims, ...inferredClaims].map(
          (claim) => {
            const { subjectEntityLocalId, objectEntityLocalId } = claim;
            const subjectDuplicate = duplicates.find(({ duplicateIds }) =>
              duplicateIds.includes(subjectEntityLocalId),
            );

            const objectDuplicate = objectEntityLocalId
              ? duplicates.find(({ duplicateIds }) =>
                  duplicateIds.includes(objectEntityLocalId),
                )
              : undefined;

            return {
              ...claim,
              subjectEntityLocalId:
                subjectDuplicate?.canonicalId ?? claim.subjectEntityLocalId,
              objectEntityLocalId:
                objectDuplicate?.canonicalId ?? objectEntityLocalId,
            };
          },
        );
      }
    }

    /**
     * Reset the list of resources to explore for the next iteration.
     */
    resourcesToExplore = [];

    const previouslyVisitedLinks = exploredResources.map((visitedResource) => ({
      url: visitedResource.url,
    }));

    possibleNextLinks = possibleNextLinks.filter(
      (link, index, all) =>
        /**
         * Don't provide links that have already been visited
         */
        !previouslyVisitedLinks.some((visitedResource) =>
          areUrlsEqual(visitedResource.url, link.url),
        ) &&
        /**
         * Don't include duplicates
         */
        all.findIndex((innerLink) => areUrlsEqual(link.url, innerLink.url)) ===
          index,
    );

    /**
     * Prior to asking the link follower to decide on its next actions, check if we should stop.
     */
    const preRequestNextActionsShouldStop =
      await checkIfWorkerShouldStop(workerIdentifiers);

    if (preRequestNextActionsShouldStop.shouldStop) {
      logProgress([
        {
          explanation: preRequestNextActionsShouldStop.explanation,
          recordedAt: new Date().toISOString(),
          stepId: Context.current().info.activityId,
          type: "WorkerWasStopped",
          ...workerIdentifiers,
        },
      ]);

      return {
        status: "ok",
        inferredClaims: allInferredClaims,
        inferredSummaries: allInferredEntitySummaries,
        suggestionForNextSteps,
        exploredResources,
      };
    }

    const toolCallResponse = await getLinkFollowerNextToolCalls({
      goal,
      entitySummaries: allInferredEntitySummaries,
      claimsGathered: allInferredClaims,
      previouslyVisitedLinks,
      possibleNextLinks,
    });

    if (toolCallResponse.status === "aborted") {
      /**
       * The flow has been cancelled or otherwise closed
       * – we just need the activity functions to end, there is no workflow to do anything with their returns.
       */
      break;
    }

    const { nextToolCall } = toolCallResponse;

    if (nextToolCall.name === "exploreLinks") {
      const { links } = nextToolCall.input;

      logger.debug(`Exploring additional links: ${stringify(links)}`);

      resourcesToExplore.push(...links);
    } else {
      /**
       * Otherwise, the tool call is either `complete` or `terminate`
       * and we can set the suggestion for next steps.
       */

      suggestionForNextSteps = nextToolCall.input.suggestionForNextSteps;
    }
  }

  return {
    status: "ok",
    inferredClaims: allInferredClaims,
    inferredSummaries: allInferredEntitySummaries,
    suggestionForNextSteps,
    exploredResources,
  };
};
