import * as React from "react";

import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Box, CssBaseline, Theme, ThemeProvider } from "@mui/material";
import { theme } from "@hashintel/hash-design-system";
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
import { LoadingUI } from "./loading-ui";
import mockData from "../example-graph.json";

export enum BlockState {
  Loading,
  Error,
  Selector,
  Overview,
}

type BlockEntityProperties = {
  selectedPullRequest?: PullRequestIdentifier;
};

// 13/16px
// body => 14/17px
// 16/19px
// 32/110% or 35px

const customTheme: Theme = {
  ...theme,
  typography: {
    ...theme.typography,
    // @todo make base font-size 14px
    // fontSize: 14,
  },
};

export const App: BlockComponent<BlockEntityProperties> = ({
  accountId,
  // entityId,
  graph: { blockEntity },
  // aggregateEntities,
  // selectedPullRequest,
  // selectedPullRequest = {
  //   repository: (mockData.entities[0] as GithubPullRequest).repository,
  //   number: (mockData.entities[0] as GithubPullRequest).number,
  // } as PullRequestIdentifier,
  // updateEntities,
  // aggregateEntityTypes,
}) => {
  const blockRef = React.useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);
  const {
    entityId,
    properties: {
      selectedPullRequest = {
        repository: (mockData.entities[0] as GithubPullRequest).repository,
        number: (mockData.entities[0] as GithubPullRequest).number,
      } as PullRequestIdentifier,
    },
  } = blockEntity;
  const [blockState, setBlockState] = React.useState(BlockState.Loading);

  // selectedPullRequest is just an Identifier, but isn't the associated GithubPullRequestEntity
  const [selectedPullRequestId, setSelectedPullRequestId] = React.useState<
    PullRequestIdentifier | undefined
  >(selectedPullRequest);

  const setSelectedPullRequestIdAndPersist = (
    pullRequestId?: PullRequestIdentifier,
  ) => {
    void graphService
      ?.updateEntity({
        data: {
          entityId,
          properties: {
            selectedPullRequest: pullRequestId,
          },
        },
      })
      .then(({ errors }) => {
        if (errors) {
          console.error(errors);
        }
      });

    setSelectedPullRequestId(pullRequestId);
  };

  const [githubEntityTypeIds, setGithubEntityTypeIds] =
    React.useState<{ [key in GITHUB_ENTITY_TYPES]: string }>();

  const [allPrs, setAllPrs] = React.useState<Map<string, GithubPullRequest>>();
  const [pullRequest, setPullRequest] = React.useState<GithubPullRequest>(
    mockData.entities[0] as GithubPullRequest,
  );
  // const [pullRequest, setPullRequest] = React.useState<GithubPullRequest>();
  const [reviews, setReviews] = React.useState<GithubReview[]>();
  const [events, setEvents] = React.useState<GithubIssueEvent[]>();

  /** @todo - Figure out when to query for more than one page, probably querying until no more results */

  React.useEffect(() => {
    if (
      graphService?.aggregateEntityTypes &&
      githubEntityTypeIds === undefined
    ) {
      setBlockState(BlockState.Loading);
      getGithubEntityTypes(
        graphService.aggregateEntityTypes,
        5,
        setGithubEntityTypeIds,
        setBlockState,
      );
    }
  }, [
    githubEntityTypeIds,
    accountId,
    setGithubEntityTypeIds,
    setBlockState,
    graphService,
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
        graphService?.aggregateEntities,
        accountId,
        5,
        setAllPrs,
        setBlockState,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    graphService,
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
        graphService?.aggregateEntities,
        1,
        selectedPullRequestId,
      ).then((pullRequests) => {
        if (pullRequests) {
          const pr = pullRequests.results[0];
          if (pr) {
            setPullRequest(pr);
          }
        }
      });
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    graphService,
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
        graphService?.aggregateEntities,
        accountId,
        1,
        setReviews,
        selectedPullRequestId,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    graphService,
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
        graphService?.aggregateEntities,
        accountId,
        1,
        setEvents,
        selectedPullRequestId,
      );
    }
  }, [
    githubEntityTypeIds,
    selectedPullRequestId,
    graphService,
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
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Box
        sx={({ palette }) => ({
          background: palette.gray[20],
        })}
      >
        {blockState === BlockState.Loading ? (
          <LoadingUI title="Setting up Block" />
        ) : blockState === BlockState.Selector ? (
          <PullRequestSelector
            setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
            allPrs={allPrs!}
          />
        ) : blockState === BlockState.Overview ? (
          <GithubPrOverview
            pullRequest={pullRequest}
            reviews={reviews!}
            events={events!}
            setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
            setBlockState={setBlockState}
          />
        ) : (
          <div> Failed To Load Block </div>
        )}
        <Box
          sx={{
            height: 100,
          }}
        />
      </Box>
    </ThemeProvider>
  );
};
