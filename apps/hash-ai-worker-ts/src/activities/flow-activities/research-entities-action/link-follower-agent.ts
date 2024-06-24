import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";

import { getWebPageActivity } from "../../get-web-page-activity";
import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { stringify } from "../../shared/stringify";
import { inferFactsFromText } from "../shared/infer-facts-from-text";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import { deduplicateEntities } from "./deduplicate-entities";
import type { AccessedRemoteFile } from "./infer-facts-from-web-page-worker-agent/types";
import type { Link } from "./link-follower-agent/extract-links-from-content";
import { extractLinksFromContent } from "./link-follower-agent/extract-links-from-content";
import { getLinkFollowerNextToolCalls } from "./link-follower-agent/get-link-follower-next-tool-calls";

type LinkFollowerAgentParams = {
  url: string;
  task: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
};

export const linkFollowerAgent = async (
  params: LinkFollowerAgentParams,
): Promise<{
  status: "ok";
  facts: Fact[];
  entitySummaries: LocalEntitySummary[];
  filesUsedToInferEntities: AccessedRemoteFile[];
  suggestionForNextSteps: string;
}> => {
  const { url, task, entityTypes, linkEntityTypes } = params;

  const initialWebPage = await getWebPageActivity({
    url,
    sanitizeForLlm: true,
  });

  const visitedWebPages: WebPage[] = [];

  let webPagesToExplore: WebPage[] = [initialWebPage];

  let allEntitySummaries: LocalEntitySummary[] = [];
  let allFacts: Fact[] = [];
  let suggestionForNextSteps = "";

  while (webPagesToExplore.length > 0) {
    const { possibleNextLinks, inferredFacts, inferredFactsAboutEntities } =
      await Promise.all(
        webPagesToExplore.map(async (webPage) => {
          logger.debug(`Visiting WebPage: ${webPage.url}`);

          visitedWebPages.push(webPage);

          const relevantLinksFromWebPage = await extractLinksFromContent({
            content: webPage,
            prompt: task,
          }).then((response) => {
            if (response.status === "ok") {
              return response.links;
            }

            return [];
          });

          logger.debug(
            `Extracted relevant links from WebPage with URL ${webPage.url}: ${stringify(relevantLinksFromWebPage)}`,
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
            facts: inferredFactsFromWebPage,
            entitySummaries: inferredFactsAboutEntitiesFromWebPage,
          } = await inferFactsFromText({
            text: webPage.htmlContent,
            /** @todo: consider whether this should be a dedicated input */
            relevantEntitiesPrompt: task,
            dereferencedEntityTypes: dereferencedEntityTypesById,
          });

          return {
            relevantLinksFromWebPage,
            inferredFactsFromWebPage,
            inferredFactsAboutEntitiesFromWebPage,
          };
        }),
      ).then((res) =>
        res.reduce<{
          possibleNextLinks: Link[];
          inferredFacts: Fact[];
          inferredFactsAboutEntities: LocalEntitySummary[];
        }>(
          (
            acc,
            {
              relevantLinksFromWebPage,
              inferredFactsFromWebPage,
              inferredFactsAboutEntitiesFromWebPage,
            },
          ) => ({
            possibleNextLinks: [
              ...acc.possibleNextLinks,
              ...relevantLinksFromWebPage,
            ].filter(
              /**
               * Filter duplicate URLs (possible next links that were encountered on
               * different web pages).
               */
              (possibleNextLink, index, all) =>
                all.findIndex((link) => link.url === possibleNextLink.url) ===
                index,
            ),
            inferredFacts: [...acc.inferredFacts, ...inferredFactsFromWebPage],
            inferredFactsAboutEntities: [
              ...acc.inferredFactsAboutEntities,
              ...inferredFactsAboutEntitiesFromWebPage,
            ],
          }),
          {
            possibleNextLinks: [],
            inferredFacts: [],
            inferredFactsAboutEntities: [],
          },
        ),
      );

    if (inferredFactsAboutEntities.length > 0) {
      if (allEntitySummaries.length === 0 && webPagesToExplore.length === 1) {
        /**
         * If we previously haven't encountered any entities, and we only explored
         * a single web page, we can safely assume that any entities inferred
         * are unique and don't require deduplication.
         */
        allEntitySummaries.push(...inferredFactsAboutEntities);
        allFacts.push(...inferredFacts);
      } else {
        /**
         * Otherwise we need to deduplicate the entities.
         */
        const { duplicates } = await deduplicateEntities({
          entities: [...inferredFactsAboutEntities, ...allEntitySummaries],
        });

        allEntitySummaries = [
          ...allEntitySummaries,
          ...inferredFactsAboutEntities,
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
     * Reset the list of web pages to explore for the next iteration.
     */
    webPagesToExplore = [];

    const previouslyVisitedLinks = visitedWebPages.map((visitedWebPage) => ({
      url: visitedWebPage.url,
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

      const nextWebPages = await Promise.all(
        links.map((link) =>
          getWebPageActivity({ url: link.url, sanitizeForLlm: true }),
        ),
      );

      logger.debug(`Exploring additional links: ${stringify(links)}`);

      webPagesToExplore.push(...nextWebPages);
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
    /** @todo: support inferring facts from files */
    filesUsedToInferEntities: [],
    suggestionForNextSteps,
  };
};
