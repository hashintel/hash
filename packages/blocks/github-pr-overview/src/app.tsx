import * as React from "react";

import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Box, CssBaseline, Theme, ThemeProvider } from "@mui/material";
import { theme } from "@hashintel/hash-design-system";
import {
  GithubIssueEvent,
  GithubPullRequest,
  PullRequestIdentifier,
  GithubReview,
  GITHUB_ENTITY_TYPES,
  getGithubEntityTypes,
} from "./types";
import { GithubPrOverview } from "./overview";

import {
  getPrEvents,
  getAllPRs,
  getPrs,
  getPrReviews,
} from "./entity-aggregations";
import { PullRequestSelector } from "./pull-request-selector";
import { LoadingUI } from "./loading-ui";

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
      },
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

  const fetchGithubEntityTypeIds = React.useCallback(async () => {
    if (!graphService) return;

    setBlockState(BlockState.Loading);
    try {
      const entityTypeIds = await getGithubEntityTypes(({ data }) =>
        graphService.aggregateEntityTypes({ data }),
      );

      const prs = await getAllPRs(
        entityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        ({ data }) => graphService.aggregateEntities({ data }),
      );

      setAllPrs(prs);
      setGithubEntityTypeIds(entityTypeIds);
      setBlockState(BlockState.Selector);
      // console.log("fetched ids => ", entityTypeIds);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log({ err });
      // confirm if we need this
      setBlockState(BlockState.Error);
    }
  }, [graphService]);

  React.useEffect(() => {
    if (!blockRef.current) return;
    // fetch entity types
    if (!githubEntityTypeIds) {
      void fetchGithubEntityTypeIds();
    }
  }, [githubEntityTypeIds, fetchGithubEntityTypeIds]);

  React.useEffect(() => {
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined &&
      graphService?.aggregateEntities
    ) {
      setBlockState(BlockState.Loading);

      const init = async () => {
        const [prReviews, prEvents] = await Promise.all([
          getPrReviews(
            selectedPullRequestId,
            githubEntityTypeIds[GITHUB_ENTITY_TYPES.Review],
            async ({ data }) => await graphService?.aggregateEntities({ data }),
          ),
          getPrEvents(
            selectedPullRequestId,
            githubEntityTypeIds[GITHUB_ENTITY_TYPES.IssueEvent],
            ({ data }) => graphService?.aggregateEntities({ data }),
          ),
        ]);

        setReviews(prReviews);
        setEvents(prEvents);
      };

      void init();
    }
  }, [githubEntityTypeIds, selectedPullRequestId, graphService]);

  // @todo continue from here
  // Block has been initialized with a selected Pull Request, get associated info
  React.useEffect(() => {
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined
    ) {
      setBlockState(BlockState.Loading);
      void getPrs(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        ({ data }) => graphService.aggregateEntities({ data }),
        1,
        selectedPullRequestId,
      ).then((pullRequests) => {
        // console.log("fetched request ==> ", { pullRequests });
        if (pullRequests) {
          const pr = pullRequests.results?.[0];
          if (pr) {
            setPullRequest(pr);
          }
        }
      });
    }
  }, [githubEntityTypeIds, selectedPullRequestId, graphService]);

  /** @todo - Figure out when to query for more than one page, probably querying until no more results */

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
            pullRequest={pullRequest?.properties ?? {}}
            reviews={reviews?.map((review) => ({ ...review.properties })) ?? []}
            events={events?.map((event) => ({ ...event.properties })) ?? []}
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
