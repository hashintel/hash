/** @todo - remove */
/* eslint-disable no-console */
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntitiesResult,
} from "blockprotocol";
import { uniqBy } from "lodash";

import {
  GithubIssueEvent,
  GithubIssueEventTypeId,
  GithubPullRequest,
  GithubPullRequestTypeId,
  GithubReview,
  GithubReviewTypeId,
  isDefined,
} from "./types";

const ITEMS_PER_PAGE = 100;

const prNumberFromUrl = (url: string) => {
  const segments = url.split("/");
  const prNumber = segments[segments.length - 1];
  if (!isDefined(prNumber)) {
    throw Error(`Couldn't extract PR number, invalid URL: ${url}`);
  } else {
    return parseInt(prNumber, 10);
  }
};

const getPrs = (
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
  accountId?: string | null,
  pageNumber?: number,
): Promise<BlockProtocolAggregateEntitiesResult<GithubPullRequest> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  console.log("Calling aggregateEntities");

  const res = aggregateEntities({
    accountId,
    operation: {
      entityTypeId: GithubPullRequestTypeId,
      pageNumber,
      itemsPerPage: ITEMS_PER_PAGE,
      multiFilter: {
        operator: "AND",
        filters: [
          {
            field: "html_url",
            operator: "CONTAINS",
            value: "blockprotocol/blockprotocol/pull/278",
          },
        ],
      },
      multiSort: [
        {
          field: "url",
          desc: true,
        },
      ],
    },
  });

  void res.then(() => {
    console.log(`Got result from aggregateEntities`);
  });

  return res;
};

export const collectPrsAndSetState = (
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, page) => getPrs(aggregateEntities, accountId, page));

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubPullRequest[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const pullRequests = uniqBy(entities, "id");

      const mappedPullRequests = new Map();

      for (const pullRequest of pullRequests) {
        const pullRequestId = [pullRequest.repository, pullRequest.number];
        mappedPullRequests.set(pullRequestId, pullRequest);
      }

      setState(mappedPullRequests);
    })
    .catch((err) => console.error(err));
};

const getReviews = (
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
  accountId?: string | null,
  pageNumber?: number,
): Promise<BlockProtocolAggregateEntitiesResult<GithubReview> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  console.log("Calling aggregateEntities");

  const res = aggregateEntities({
    accountId,
    operation: {
      entityTypeId: GithubReviewTypeId,
      pageNumber,
      itemsPerPage: ITEMS_PER_PAGE,
      multiFilter: {
        operator: "AND",
        filters: [
          {
            field: "html_url",
            operator: "CONTAINS",
            value: "blockprotocol/blockprotocol/pull/278",
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

  void res.then(() => {
    console.log(`Got result from aggregateEntities`);
  });

  return res;
};

export const collectReviewsAndSetState = (
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, page) => getReviews(aggregateEntities, accountId, page));

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubReview[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined);

      const reviews = uniqBy(entities, "id");

      const mappedReviews = new Map();

      for (const review of reviews) {
        const pullRequestId = [
          review.repository,
          prNumberFromUrl(review.pull_request_url!),
        ];

        if (mappedReviews.has(pullRequestId)) {
          mappedReviews.get(pullRequestId).push(review);
        } else {
          mappedReviews.set(pullRequestId, [review]);
        }
      }

      setState(mappedReviews);
    })
    .catch((err) => console.error(err));
};

const getPrEvents = (
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction,
  accountId?: string | null,
  pageNumber?: number,
): Promise<BlockProtocolAggregateEntitiesResult<GithubIssueEvent> | void> => {
  if (!aggregateEntities) {
    return new Promise<void>(() => {});
  }

  console.log("Calling aggregateEntities");

  const res = aggregateEntities({
    accountId,
    operation: {
      entityTypeId: GithubIssueEventTypeId,
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
            value: "blockprotocol/blockprotocol/pull/278",
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

  void res.then(() => {
    console.log(`Got result from aggregateEntities`);
  });

  return res;
};

export const collectPrEventsAndSetState = (
  aggregateEntities: BlockProtocolAggregateEntitiesFunction | undefined,
  accountId: string | null | undefined,
  numPages: number,
  setState: (x: any) => void,
) => {
  const results = Array(numPages)
    .fill(undefined)
    .map((_, page) => getPrEvents(aggregateEntities, accountId, page));

  Promise.all(results)
    .then((entitiesResults) => {
      const entities: GithubIssueEvent[] = entitiesResults
        .flatMap((entityResult) => entityResult?.results)
        .filter(isDefined)
        .filter(
          (entity: GithubIssueEvent) => isDefined(entity.issue?.pull_request), // We only want events for pull requests, not general issues
        );

      const events = uniqBy(entities, "id");

      /** @todo - These should be links to a PR entity really */
      const pullRequestsToEvents = new Map();

      for (const event of events) {
        const pullRequestId = [event.repository, event.issue?.number];

        if (pullRequestsToEvents.has(pullRequestId)) {
          pullRequestsToEvents.get(pullRequestId).push(event);
        } else {
          pullRequestsToEvents.set(pullRequestId, [event]);
        }
      }

      setState(pullRequestsToEvents);
    })
    .catch((err) => console.error(err));
};
