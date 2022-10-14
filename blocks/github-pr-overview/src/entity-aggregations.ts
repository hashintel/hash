import { GraphBlockHandler } from "@blockprotocol/graph";
import { uniqBy } from "lodash";

import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  PullRequestIdentifier,
  GithubReviewEntityType,
  isDefined,
  GITHUB_ENTITY_TYPES,
} from "./types";

const ITEMS_PER_PAGE = 500;

export const getGitHubEntityTypes = async (
  aggregateEntityTypes: GraphBlockHandler["aggregateEntityTypes"],
  numItems: number = ITEMS_PER_PAGE,
): Promise<{
  [key in GITHUB_ENTITY_TYPES]: string;
}> => {
  const response = await aggregateEntityTypes({
    data: {
      operation: {
        pageNumber: 1,
        itemsPerPage: numItems,
      },
    },
  });

  if (response.errors || !response.data) {
    throw new Error("An error occured while fetching events");
  }
  const entityTypes = response.data.results;

  const pullRequestTypeId = entityTypes.find(
    (entityType) => entityType.schema.title === "GithubPullRequest",
  )?.entityTypeId;
  const reviewTypeId = entityTypes.find(
    (entityType) => entityType.schema.title === "GithubReview",
  )?.entityTypeId;
  const issueEventTypeId = entityTypes.find(
    (entityType) => entityType.schema.title === "GithubIssueEvent",
  )?.entityTypeId;

  if (pullRequestTypeId && reviewTypeId && issueEventTypeId) {
    const githubTypeIds: {
      [key in GITHUB_ENTITY_TYPES]: string;
    } = {
      [GITHUB_ENTITY_TYPES.PullRequest]: pullRequestTypeId,
      [GITHUB_ENTITY_TYPES.Review]: reviewTypeId,
      [GITHUB_ENTITY_TYPES.IssueEvent]: issueEventTypeId,
    };
    return githubTypeIds;
  } else {
    throw new Error("An error occured while fetching Github Entity Types");
  }
};

export const getPrs = async (
  githubPullRequestTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  numItems: number = ITEMS_PER_PAGE,
  selectedPullRequest?: PullRequestIdentifier,
): Promise<GithubPullRequestEntityType[]> => {
  const response = await aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubPullRequestTypeId,
        pageNumber: 1,
        itemsPerPage: numItems,
        multiFilter: {
          operator: "AND",
          filters:
            selectedPullRequest !== undefined
              ? [
                  {
                    field: "properties.html_url",
                    operator: "CONTAINS",
                    value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
                  },
                ]
              : [],
        },
        multiSort: [
          {
            field: "properties.url",
            desc: true,
          },
        ],
      },
    },
  });

  if (response.errors || !response.data) {
    throw new Error("An error occured while fetching events");
  }
  const entities: GithubPullRequestEntityType[] =
    response.data.results.filter(isDefined);

  return uniqBy(entities, "properties.id");
};

export const getPrReviews = async (
  selectedPullRequest: PullRequestIdentifier,
  githubReviewTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  numItems: number = ITEMS_PER_PAGE,
) => {
  const response = await aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubReviewTypeId,
        pageNumber: 1,
        itemsPerPage: numItems,
        multiFilter: {
          operator: "AND",
          filters: [
            {
              field: "properties.html_url",
              operator: "CONTAINS",
              value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
            },
          ],
        },
        multiSort: [
          {
            field: "properties.pull_request_url",
            desc: true,
          },
          {
            field: "properties.submitted_at",
            desc: false,
          },
        ],
      },
    },
  });

  if (response.errors || !response.data) {
    throw new Error("An error occured while fetching reviews");
  }
  const entities: GithubReviewEntityType[] =
    response.data.results.filter(isDefined);

  return uniqBy(entities, "properties.id");
};

export const getPrEvents = async (
  selectedPullRequest: PullRequestIdentifier,
  githubIssueEventTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  numItems: number = ITEMS_PER_PAGE,
): Promise<GithubIssueEventEntityType[]> => {
  /** @todo - These should be links to a PR entity really */
  const response = await aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubIssueEventTypeId,
        pageNumber: 1,
        itemsPerPage: numItems,
        multiFilter: {
          operator: "AND",
          filters: [
            {
              field: "properties.issue.pull_request",
              operator: "IS_NOT_EMPTY",
            },
            {
              field: "properties.issue.html_url",
              operator: "CONTAINS",
              value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
            },
          ],
        },
        multiSort: [
          {
            field: "properties.issue.html_url",
            desc: true,
          },
          {
            field: "properties.created_at",
            desc: false,
          },
        ],
      },
    },
  });

  if (response.errors || !response.data) {
    throw new Error("An error occured while fetching events");
  }
  const entities: GithubIssueEventEntityType[] = response.data.results.filter(
    (entity: GithubIssueEventEntityType) =>
      isDefined(entity.properties.issue?.pull_request),
  );

  return uniqBy(entities, "properties.id");
};

/**
 * Fetches github entity types and all pull requests.
 * @param initialEntityTypes
 * @param aggregateEntityTypes
 * @param aggregateEntities
 * @returns
 */
export const getEntityTypeIdsAndPrs = async (
  initialEntityTypes: { [key in GITHUB_ENTITY_TYPES]: string } | undefined,
  aggregateEntityTypes: GraphBlockHandler["aggregateEntityTypes"],
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
): Promise<{
  entityTypeIds: { [key in GITHUB_ENTITY_TYPES]: string };
  prs: Map<string, GithubPullRequestEntityType>;
}> => {
  try {
    let githubEntityTypeIds = initialEntityTypes;

    // Fetch github entity types if they aren't present
    if (!initialEntityTypes) {
      githubEntityTypeIds = await getGitHubEntityTypes(({ data }) =>
        aggregateEntityTypes({ data }),
      );
    }

    const prs = await getPrs(
      githubEntityTypeIds![GITHUB_ENTITY_TYPES.PullRequest],
      ({ data }) => aggregateEntities({ data }),
    );

    const mappedPullRequests = new Map();

    for (const pullRequest of prs) {
      const pullRequestId = `${pullRequest.properties.repository}/${pullRequest.properties.number}`;
      mappedPullRequests.set(pullRequestId, pullRequest);
    }

    return { entityTypeIds: githubEntityTypeIds!, prs: mappedPullRequests };
  } catch (err) {
    throw new Error(
      "An error occured while fetching entityTypes and initial PRs",
    );
  }
};

/**
 * Fetched the events and reviews associated with a pullrequest id including
 * the pull request details
 * @param selectedPullRequestId
 * @param githubEntityTypeIds
 * @param aggregateEntities
 * @returns
 */
export const getPrDetails = (
  selectedPullRequestId: PullRequestIdentifier,
  githubEntityTypeIds: { [key in GITHUB_ENTITY_TYPES]: string },
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
): Promise<{
  pullRequest: GithubPullRequestEntityType;
  reviews: GithubReviewEntityType["properties"][];
  events: GithubIssueEventEntityType["properties"][];
}> => {
  return Promise.all([
    getPrs(
      githubEntityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
      ({ data }) => aggregateEntities({ data }),
      1,
      selectedPullRequestId,
    ),
    getPrReviews(
      selectedPullRequestId,
      githubEntityTypeIds[GITHUB_ENTITY_TYPES.Review],
      async ({ data }) => await aggregateEntities({ data }),
    ),
    getPrEvents(
      selectedPullRequestId,
      githubEntityTypeIds[GITHUB_ENTITY_TYPES.IssueEvent],
      ({ data }) => aggregateEntities({ data }),
    ),
  ])
    .then(([pullRequests, reviews, events]) => {
      const pullRequest = pullRequests?.[0];
      if (!pullRequest) {
        throw new Error("An error occured while fetching PR info");
      }

      return {
        pullRequest,
        reviews: reviews.map((review) => ({ ...review.properties })),
        events: events.map((event) => ({ ...event.properties })),
      };
    })
    .catch((_) => {
      throw new Error("An error occured while fetching PR info");
    });
};
