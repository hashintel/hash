import {
  GraphBlockHandler,
  AggregateEntitiesResult,
} from "@blockprotocol/graph";
import { uniqBy } from "lodash";

import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  PullRequestIdentifier,
  GithubReviewEntityType,
  isDefined,
  GITHUB_ENTITY_TYPES,
} from "./types";

const ITEMS_PER_PAGE = 100;

export const getGithubEntityTypes = (
  aggregateEntityTypes: GraphBlockHandler["aggregateEntityTypes"],
  numPages: number = 5,
) => {
  const promises = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      /** @todo - These should be links to a PR entity really */
      aggregateEntityTypes({
        data: {
          operation: {
            pageNumber,
          },
        },
      }),
    );
  return Promise.all(promises)
    .then((entityTypesResults) => {
      const entityTypes = entityTypesResults.flatMap(
        (entityTypeResult) => entityTypeResult.data?.results ?? [],
      );

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
    })
    .catch((err) => {
      throw err;
    });
};

export const getPrsPerPage = async (
  githubPullRequestTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  pageNumber: number = 1,
  selectedPullRequest?: PullRequestIdentifier,
): Promise<AggregateEntitiesResult<GithubPullRequestEntityType> | void> => {
  return aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubPullRequestTypeId,
        pageNumber,
        itemsPerPage: ITEMS_PER_PAGE,
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
  }).then(({ errors, data }) => {
    if (!errors && data) {
      return data;
    }
    throw new Error("An error occured");
  });
};

export const getAllPRs = (
  githubPullRequestTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  numPages: number = 5,
) => {
  const promises = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      getPrsPerPage(githubPullRequestTypeId, aggregateEntities, pageNumber),
    );
  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubPullRequestEntityType[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const pullRequests = uniqBy(entities, "properties.id");

      const mappedPullRequests = new Map();

      for (const pullRequest of pullRequests) {
        const pullRequestId = `${pullRequest.properties.repository}/${pullRequest.properties.number}`;
        mappedPullRequests.set(pullRequestId, pullRequest);
      }

      return mappedPullRequests;
    })
    .catch((err) => {
      throw err;
    });
};

const getReviewsPerPage = (
  selectedPullRequest: PullRequestIdentifier,
  githubReviewTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  pageNumber: number | undefined,
): Promise<AggregateEntitiesResult<GithubReviewEntityType> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  return aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubReviewTypeId,
        pageNumber,
        itemsPerPage: ITEMS_PER_PAGE,
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
  }).then(({ errors, data }) => {
    if (!errors && data) {
      return data;
    }
    throw new Error("An error occured");
  });
};

export const getPrReviews = async (
  selectedPullRequest: PullRequestIdentifier,
  githubReviewTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  numPages: number = 1,
) => {
  const promises = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      getReviewsPerPage(
        selectedPullRequest,
        githubReviewTypeId,
        aggregateEntities,
        pageNumber,
      ),
    );

  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubReviewEntityType[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const reviews = uniqBy(entities, "properties.id");

      return reviews;
    })
    .catch((err) => {
      throw err;
    });
};

const getEventsPerPage = (
  githubIssueEventTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  pageNumber: number | undefined,
  selectedPullRequest: PullRequestIdentifier,
): Promise<AggregateEntitiesResult<GithubIssueEventEntityType> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  return aggregateEntities({
    data: {
      operation: {
        entityTypeId: githubIssueEventTypeId,
        pageNumber,
        itemsPerPage: ITEMS_PER_PAGE,
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
  }).then(({ errors, data }) => {
    if (!errors && data) {
      return data;
    }
    throw new Error("An error occured");
  });
};

export const getPrEvents = async (
  selectedPullRequest: PullRequestIdentifier,
  githubIssueEventTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  numPages: number = 1,
) => {
  const promises = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      /** @todo - These should be links to a PR entity really */
      getEventsPerPage(
        githubIssueEventTypeId,
        aggregateEntities,
        pageNumber,
        selectedPullRequest,
      ),
    );

  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubIssueEventEntityType[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined)
        .filter(
          (entity: GithubIssueEventEntityType) =>
            isDefined(entity.properties.issue?.pull_request), // We only want events for pull requests, not general issues
        );

      const events = uniqBy(entities, "properties.id");

      return events;
    })
    .catch((err) => {
      throw err;
    });
};
