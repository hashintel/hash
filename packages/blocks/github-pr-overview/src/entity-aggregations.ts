import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
} from "blockprotocol";
import { uniqBy } from "lodash";
import { BlockState } from "./app";

import {
  GithubIssueEvent,
  GithubPullRequest,
  PullRequestIdentifier,
  GithubReview,
  isDefined,
} from "./types";

const ITEMS_PER_PAGE = 100;

export const getPrs = (
  githubPullRequestTypeId: string,
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
  accountId?: string | null,
  pageNumber?: number,
  selectedPullRequest?: PullRequestIdentifier,
): Promise<BlockProtocolAggregateEntitiesResult<GithubPullRequest> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  const res = aggregateEntities({
    accountId,
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
                  field: "html_url",
                  operator: "CONTAINS",
                  value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
                },
              ]
            : [],
      },
      multiSort: [
        {
          field: "url",
          desc: true,
        },
      ],
    },
  });

  return res;
};

export const collectPrsAndSetState = (
  githubPullRequestTypeId: string,
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
  setBlockState: (x: any) => void,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      getPrs(githubPullRequestTypeId, aggregateEntities, accountId, pageNumber),
    );

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubPullRequest[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const pullRequests = uniqBy(entities, "id");

      const mappedPullRequests = new Map();

      for (const pullRequest of pullRequests) {
        const pullRequestId = `${pullRequest.repository}/${pullRequest.number}`;
        mappedPullRequests.set(pullRequestId, pullRequest);
      }

      setState(mappedPullRequests);
      if (mappedPullRequests.size === 0) {
        setBlockState(BlockState.Error);
      }
    })
    .catch((err) => {
      throw err;
    });
};

const getReviews = (
  githubReviewTypeId: string,
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  pageNumber: number | undefined,
  selectedPullRequest: PullRequestIdentifier,
): Promise<BlockProtocolAggregateEntitiesResult<GithubReview> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  const res = aggregateEntities({
    accountId,
    operation: {
      entityTypeId: githubReviewTypeId,
      pageNumber,
      itemsPerPage: ITEMS_PER_PAGE,
      multiFilter: {
        operator: "AND",
        filters: [
          {
            field: "html_url",
            operator: "CONTAINS",
            value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
          },
        ],
      },
      multiSort: [
        {
          field: "pull_request_url",
          desc: true,
        },
        {
          field: "submitted_at",
          desc: false,
        },
      ],
    },
  });

  return res;
};

export const collectReviewsAndSetState = (
  githubReviewTypeId: string,
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
  selectedPullRequest: PullRequestIdentifier,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      getReviews(
        githubReviewTypeId,
        aggregateEntities,
        accountId,
        pageNumber,
        selectedPullRequest,
      ),
    );

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubReview[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const reviews = uniqBy(entities, "id");

      setState(reviews);
    })
    .catch((err) => {
      throw err;
    });
};

const getPrEvents = (
  githubIssueEventTypeId: string,
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  pageNumber: number | undefined,
  selectedPullRequest: PullRequestIdentifier,
): Promise<BlockProtocolAggregateEntitiesResult<GithubIssueEvent> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  const res = aggregateEntities({
    accountId,
    operation: {
      entityTypeId: githubIssueEventTypeId,
      pageNumber,
      itemsPerPage: ITEMS_PER_PAGE,
      multiFilter: {
        operator: "AND",
        filters: [
          {
            field: "issue.pull_request",
            operator: "IS_NOT_EMPTY",
            value: "",
          },
          {
            field: "issue.html_url",
            operator: "CONTAINS",
            value: `${selectedPullRequest.repository}/pull/${selectedPullRequest.number}`,
          },
        ],
      },
      multiSort: [
        {
          field: "issue.html_url",
          desc: true,
        },
        {
          field: "created_at",
          desc: false,
        },
      ],
    },
  });

  return res;
};

export const collectPrEventsAndSetState = (
  githubIssueEventTypeId: string,
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
  selectedPullRequest: PullRequestIdentifier,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, pageNumber) =>
      /** @todo - These should be links to a PR entity really */
      getPrEvents(
        githubIssueEventTypeId,
        aggregateEntities,
        accountId,
        pageNumber,
        selectedPullRequest,
      ),
    );

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubIssueEvent[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined)
        .filter(
          (entity: GithubIssueEvent) => isDefined(entity.issue?.pull_request), // We only want events for pull requests, not general issues
        );

      const events = uniqBy(entities, "id");

      setState(events);
    })
    .catch((err) => {
      throw err;
    });
};
