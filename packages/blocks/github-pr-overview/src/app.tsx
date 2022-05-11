import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import CircularProgress from "@mui/material/CircularProgress";
import {
  GithubIssueEvent,
  GithubPullRequest,
  PullRequestIdentifier,
  GithubReview,
  isDefined,
  GITHUB_ENTITY_TYPES,
  getGithubEntityTypes,
} from "./types";
import { GithubPrOverview } from "./overview";
import {
  collectPrEventsAndSetState,
  collectPrsAndSetState,
  collectReviewsAndSetState,
  getPrs,
} from "./entity-aggregations";
import { PullRequestSelector } from "./pull-request-selector";

export enum BlockState {
  Loading,
  Error,
  Selector,
  Overview,
}

type AppProps = {
  selectedPullRequest?: PullRequestIdentifier;
};

export const App: BlockComponent<AppProps> = ({
  accountId,
  entityId,
  aggregateEntities,
  selectedPullRequest,
  updateEntities,
  aggregateEntityTypes,
}) => {
  const [blockState, setBlockState] = React.useState(BlockState.Loading);

  // selectedPullRequest is just an Identifier, but isn't the associated GithubPullRequestEntity
  const [selectedPullRequestId, setSelectedPullRequestId] =
    React.useState(selectedPullRequest);

  const setSelectedPullRequestIdAndPersist = (
    pullRequestId?: PullRequestIdentifier,
  ) => {
    if (updateEntities) {
      updateEntities([
        {
          entityId,
          accountId,
          data: {
            selectedPullRequest: pullRequestId,
          },
        },
      ]).catch((err) => {
        throw err;
      });
    }
    setSelectedPullRequestId(pullRequestId);
  };

  const [githubEntityTypeIds, setGithubEntityTypeIds] =
    React.useState<{ [key in GITHUB_ENTITY_TYPES]: string }>();

  const [allPrs, setAllPrs] = React.useState<Map<string, GithubPullRequest>>();
  const [pullRequest, setPullRequest] = React.useState<GithubPullRequest>();
  const [reviews, setReviews] = React.useState<GithubReview[]>();
  const [events, setEvents] = React.useState<GithubIssueEvent[]>();

  /** @todo - Figure out when to query for more than one page, probably querying until no more results */

  React.useEffect(() => {
    if (isDefined(aggregateEntityTypes) && githubEntityTypeIds === undefined) {
      setBlockState(BlockState.Loading);
      getGithubEntityTypes(
        aggregateEntityTypes,
        accountId,
        5,
        setGithubEntityTypeIds,
        setBlockState,
      );
    }
  }, [
    aggregateEntityTypes,
    githubEntityTypeIds,
    accountId,
    setGithubEntityTypeIds,
    setBlockState,
  ]);

  // Block hasn't been initialized with a selected Pull Request, get all PRs to allow user to pick
  React.useEffect(() => {
    if (
      selectedPullRequestId === undefined &&
      githubEntityTypeIds !== undefined
    ) {
      setBlockState(BlockState.Loading);
      collectPrsAndSetState(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        aggregateEntities,
        accountId,
        5,
        setAllPrs,
        setBlockState,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    aggregateEntities,
    accountId,
    setAllPrs,
    setBlockState,
  ]);

  // Block has been initialized with a selected Pull Request, get associated info
  React.useEffect(() => {
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined
    ) {
      setBlockState(BlockState.Loading);
      void getPrs(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        aggregateEntities,
        accountId,
        1,
        selectedPullRequestId,
      ).then((pullRequests) => {
        if (pullRequests) {
          const pr = pullRequests.results[0];
          setPullRequest(pr);
        }
      });
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    aggregateEntities,
    accountId,
    setPullRequest,
    setBlockState,
  ]);
  React.useEffect(() => {
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined
    ) {
      setBlockState(BlockState.Loading);
      collectReviewsAndSetState(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.Review],
        aggregateEntities,
        accountId,
        1,
        setReviews,
        selectedPullRequestId,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    aggregateEntities,
    accountId,
    setReviews,
    setBlockState,
  ]);
  React.useEffect(() => {
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined
    ) {
      setBlockState(BlockState.Loading);
      collectPrEventsAndSetState(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.IssueEvent],
        aggregateEntities,
        accountId,
        1,
        setEvents,
        selectedPullRequestId,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    aggregateEntities,
    accountId,
    setEvents,
    setBlockState,
  ]);

  if (
    allPrs !== undefined &&
    allPrs.size > 0 &&
    blockState === BlockState.Loading
  ) {
    setBlockState(BlockState.Selector);
  } else if (
    selectedPullRequestId !== undefined &&
    pullRequest !== undefined &&
    reviews !== undefined &&
    events !== undefined &&
    blockState !== BlockState.Overview
  ) {
    setBlockState(BlockState.Overview);
  }

  /** @todo - Filterable list to select a pull-request */
  return (
    <div>
      {blockState === BlockState.Loading ? (
        <CircularProgress />
      ) : blockState === BlockState.Selector ? (
        <PullRequestSelector
          setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
          allPrs={allPrs!}
        />
      ) : blockState === BlockState.Overview ? (
        <GithubPrOverview
          pullRequest={pullRequest!}
          reviews={reviews!}
          events={events!}
          setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
          setBlockState={setBlockState}
        />
      ) : (
        <div> Failed To Load Block </div>
      )}
    </div>
  );
};
