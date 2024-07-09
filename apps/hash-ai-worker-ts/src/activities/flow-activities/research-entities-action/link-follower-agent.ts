import type { SourceProvenance } from "@local/hash-graph-client";
import { SourceType } from "@local/hash-graph-client";
import dedent from "dedent";
import { MetadataMode } from "llamaindex";

import { getWebPageActivity } from "../../get-web-page-activity";
import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getFlowContext } from "../../shared/get-flow-context";
import { logProgress } from "../../shared/log-progress";
import { stringify } from "../../shared/stringify";
import { inferFactsFromText } from "../shared/infer-facts-from-text";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import { deduplicateEntities } from "./deduplicate-entities";
import type { Link } from "./link-follower-agent/extract-links-from-content";
import { extractLinksFromContent } from "./link-follower-agent/extract-links-from-content";
import { filterAndRankTextChunksAgent } from "./link-follower-agent/filter-and-rank-text-chunks-agent";
import { getLinkFollowerNextToolCalls } from "./link-follower-agent/get-link-follower-next-tool-calls";
import { indexPdfFile } from "./link-follower-agent/llama-index/index-pdf-file";

type ResourceToExplore = {
  url: string;
  descriptionOfExpectedContent: string;
  exampleOfExpectedContent: string;
  reason: string;
};

type LinkFollowerAgentInput = {
  initialResource: ResourceToExplore;
  task: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
};

const isContentAtUrlPdfFile = async (params: { url: string }) => {
  const { url } = params;

  try {
    const urlHeadFetch = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    /**
     * Only check the content type of the URL if the HEAD request was successful.
     *
     * This may be because the web page requires an authenticated user to access it.
     */
    if (urlHeadFetch.ok) {
      const contentType = urlHeadFetch.headers.get("Content-Type");

      if (contentType && contentType.includes("application/pdf")) {
        return true;
      }
    }
  } catch (error) {
    logger.error(
      `Error encountered when checking if content at URL ${url} is a PDF file: ${stringify(error)}`,
    );
  }
  return false;
};

const exploreResource = async (params: {
  input: LinkFollowerAgentInput;
  resource: ResourceToExplore;
}): Promise<
  | {
      status: "ok";
      resource: ResourceToExplore;
      possibleNextLinks: Link[];
      inferredFacts: Fact[];
      inferredEntitySummaries: LocalEntitySummary[];
    }
  | {
      status: "not-explored";
      resource: ResourceToExplore;
      reason: string;
    }
> => {
  const { resource, input } = params;

  logger.debug(`Exploring resource at URL: ${resource.url}`);

  const { stepId } = await getFlowContext();

  const isResourcePdfFile = await isContentAtUrlPdfFile({
    url: resource.url,
  });

  let content = "";
  let resourceTitle: string | undefined = undefined;

  if (isResourcePdfFile) {
    const { vectorStoreIndex } = await indexPdfFile({
      fileUrl: resource.url,
    });

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
        fileUrl: resource.url,
        explanation: resource.reason,
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
      Here is a list of the most relevant sections of the PDF file with file URL ${resource.url}:
      ${orderedRelevantTextChunks
        .map((text, index) => `Relevant section ${index + 1}: ${text}`)
        .join("\n")}
      `);
  } else {
    const webPage = await getWebPageActivity({
      url: resource.url,
      sanitizeForLlm: true,
    });

    if ("error" in webPage) {
      return {
        status: "not-explored",
        reason: webPage.error,
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
      },
    ]);

    content = webPage.htmlContent;
  }

  const { task, entityTypes, linkEntityTypes } = input;

  const relevantLinksFromContent = await extractLinksFromContent({
    contentUrl: resource.url,
    content,
    prompt: task,
  }).then((response) => {
    if (response.status === "ok") {
      return response.links;
    }

    return [];
  });

  logger.debug(
    `Extracted relevant links from the content of the resource with URL ${resource.url}: ${stringify(relevantLinksFromContent)}`,
  );

  const dereferencedEntityTypesById = {
    ...entityTypes.reduce<DereferencedEntityTypesByTypeId>(
      (prev, schema) => ({
        ...prev,
        [schema.$id]: { schema, isLink: false },
      }),
      {},
    ),
    ...(linkEntityTypes ?? []).reduce<DereferencedEntityTypesByTypeId>(
      (prev, schema) => ({
        ...prev,
        [schema.$id]: { schema, isLink: true },
      }),
      {},
    ),
  };

  const {
    facts: inferredFactsFromContent,
    entitySummaries: inferredEntitySummariesFromContent,
  } = await inferFactsFromText({
    text: content,
    /** @todo: consider whether this should be a dedicated input */
    relevantEntitiesPrompt: task,
    dereferencedEntityTypes: dereferencedEntityTypesById,
  });

  /**
   * @todo check if file already exists as an entity and link the id here,
   *    plus include description etc from properties if available
   */

  const factSource: SourceProvenance = {
    type: isResourcePdfFile ? SourceType.Document : SourceType.Webpage,
    location: {
      uri: resource.url,
      /**
       * @todo: extract the title from the PDF file using a pdf parsing package or an LLM.
       */
      name: resourceTitle,
      /**
       * @todo: generate a description of the resource via an LLM. Alternatively the
       * `descriptionOfExpectedContent` of the resource could be used, but this is
       * imperfect as it was not generated based on the content of the resource.
       */
      description: undefined,
    },
    loadedAt: new Date().toISOString(),
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

  const inferredFactsWithSource = inferredFactsFromContent.map((fact) => ({
    ...fact,
    sources: [...(fact.sources ?? []), factSource],
  }));

  return {
    status: "ok",
    resource,
    possibleNextLinks: relevantLinksFromContent,
    inferredFacts: inferredFactsWithSource,
    inferredEntitySummaries: inferredEntitySummariesFromContent,
  };
};

export const linkFollowerAgent = async (
  params: LinkFollowerAgentInput,
): Promise<{
  status: "ok";
  facts: Fact[];
  exploredResources: ResourceToExplore[];
  entitySummaries: LocalEntitySummary[];
  suggestionForNextSteps: string;
}> => {
  const { initialResource, task } = params;

  const exploredResources: ResourceToExplore[] = [];

  let resourcesToExplore: ResourceToExplore[] = [initialResource];

  let allEntitySummaries: LocalEntitySummary[] = [];
  let allFacts: Fact[] = [];
  let suggestionForNextSteps = "";

  while (resourcesToExplore.length > 0) {
    const exploredResourcesResponses = await Promise.all(
      resourcesToExplore.map((resource) =>
        exploreResource({ resource, input: params }),
      ),
    );

    let possibleNextLinks: Link[] = [];
    const inferredFacts: Fact[] = [];
    const inferredEntitySummaries: LocalEntitySummary[] = [];

    for (const response of exploredResourcesResponses) {
      exploredResources.push(response.resource);

      if (response.status === "ok") {
        possibleNextLinks = [
          ...possibleNextLinks,
          ...response.possibleNextLinks,
        ].filter(
          /**
           * Filter duplicate URLs (possible next links that were encountered on
           * different resources).
           */
          (possibleNextLink, index, all) =>
            all.findIndex((link) => link.url === possibleNextLink.url) ===
            index,
        );

        inferredFacts.push(...response.inferredFacts);
        inferredEntitySummaries.push(...response.inferredEntitySummaries);
      } else {
        logger.debug(
          `Resource at URL ${response.resource.url} not explored: ${response.reason}`,
        );
      }
    }

    if (inferredEntitySummaries.length > 0) {
      if (allEntitySummaries.length === 0 && resourcesToExplore.length === 1) {
        /**
         * If we previously haven't encountered any entities, and we only explored
         * a single resource, we can safely assume that any entities inferred
         * are unique and don't require deduplication.
         */
        allEntitySummaries.push(...inferredEntitySummaries);
        allFacts.push(...inferredFacts);
      } else {
        /**
         * Otherwise we need to deduplicate the entities.
         */
        const { duplicates } = await deduplicateEntities({
          entities: [...inferredEntitySummaries, ...allEntitySummaries],
        });

        allEntitySummaries = [
          ...allEntitySummaries,
          ...inferredEntitySummaries,
        ].filter(
          ({ localId }) =>
            !duplicates.some(({ duplicateIds }) =>
              duplicateIds.includes(localId),
            ),
        );

        allFacts = [...allFacts, ...inferredFacts].map((fact) => {
          const { subjectEntityLocalId, objectEntityLocalId } = fact;
          const subjectDuplicate = duplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(subjectEntityLocalId),
          );

          const objectDuplicate = objectEntityLocalId
            ? duplicates.find(({ duplicateIds }) =>
                duplicateIds.includes(objectEntityLocalId),
              )
            : undefined;

          return {
            ...fact,
            subjectEntityLocalId:
              subjectDuplicate?.canonicalId ?? fact.subjectEntityLocalId,
            objectEntityLocalId:
              objectDuplicate?.canonicalId ?? objectEntityLocalId,
          };
        });
      }
    }

    /**
     * Reset the list of resources to explore for the next iteration.
     */
    resourcesToExplore = [];

    const previouslyVisitedLinks = exploredResources.map((visitedResource) => ({
      url: visitedResource.url,
    }));

    const { nextToolCall } = await getLinkFollowerNextToolCalls({
      task,
      entitySummaries: allEntitySummaries,
      factsGathered: allFacts,
      previouslyVisitedLinks,
      possibleNextLinks,
    });

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
    facts: allFacts,
    entitySummaries: allEntitySummaries,
    suggestionForNextSteps,
    exploredResources,
  };
};
