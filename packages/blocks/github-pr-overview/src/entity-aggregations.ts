import {
  GraphBlockHandler,
  AggregateEntitiesResult,
  Entity,
} from "@blockprotocol/graph";
import { uniqBy } from "lodash";
import { BlockState } from "./app";

import {
  GithubIssueEvent,
  GithubPullRequest,
  PullRequestIdentifier,
  GithubReview,
  isDefined,
} from "./types";

// TODO
// update the types to v0.2
// update example-graph.json format
// should be in format => { entityId: "123", properties: { xyz: "github stuff" }  }
//

const ITEMS_PER_PAGE = 100;

export const getPrs = async (
  githubPullRequestTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  pageNumber: number = 1,
  selectedPullRequest?: PullRequestIdentifier,
): Promise<AggregateEntitiesResult<GithubPullRequest> | void> => {
  const res = await aggregateEntities({
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
  });

  // @todo fix types

  if (!res.errors && res.data) {
    return res.data;
  }

  return { results: [] };
};

export const getAllPRs = (
  githubPullRequestTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"],
  numPages: number = 5,
) => {
  const promises = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      getPrs(githubPullRequestTypeId, aggregateEntities, pageNumber),
    );
  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubPullRequest[] = entitiesResults
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

const getReviews = async (
  selectedPullRequest: PullRequestIdentifier,
  githubReviewTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  pageNumber: number | undefined,
): Promise<AggregateEntitiesResult<GithubReview> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  const res = await aggregateEntities({
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
  });

  if (!res.errors && res.data) {
    return res.data;
  }
  // @todo fix
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
      getReviews(
        selectedPullRequest,
        githubReviewTypeId,
        aggregateEntities,
        pageNumber,
      ),
    );

  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubReview[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const reviews = uniqBy(entities, "properties.id");

      return reviews;
    })
    .catch((err) => {
      throw err;
    });
};

// rename
const getEvents = async (
  githubIssueEventTypeId: string,
  aggregateEntities: GraphBlockHandler["aggregateEntities"] | undefined,
  pageNumber: number | undefined,
  selectedPullRequest: PullRequestIdentifier,
): Promise<AggregateEntitiesResult<GithubIssueEvent> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  const res = await aggregateEntities({
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
  });

  if (!res.errors && res.data) {
    return res.data;
  }

  // return res as Promise<AggregateEntitiesResult<
  //   Entity<GithubIssueEvent>
  // > | void>;
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
      getEvents(
        githubIssueEventTypeId,
        aggregateEntities,
        pageNumber,
        selectedPullRequest,
      ),
    );

  return Promise.all(promises)
    .then((entitiesResults) => {
      const entities: GithubIssueEvent[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined)
        .filter(
          (entity: GithubIssueEvent) =>
            isDefined(entity.properties.issue?.pull_request), // We only want events for pull requests, not general issues
        );

      const events = uniqBy(entities, "properties.id");

      return events;
    })
    .catch((err) => {
      throw err;
    });
};
