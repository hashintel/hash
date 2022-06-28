import * as React from "react";

import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Box, CssBaseline, Theme, ThemeProvider } from "@mui/material";
import { theme } from "@hashintel/hash-design-system";
import {
  GithubIssueEventEntityType,
  GithubPullRequestEntityType,
  PullRequestIdentifier,
  GithubReviewEntityType,
  GITHUB_ENTITY_TYPES,
  BlockState,
} from "./types";
import { GithubPrOverview } from "./overview";

import {
  getPrEvents,
  getAllPRs,
  getPrsPerPage,
  getPrReviews,
  getGithubEntityTypes,
} from "./entity-aggregations";
import { PullRequestSelector } from "./pull-request-selector";
import { InfoUI } from "./info-ui";

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
    fontSize: 14,
    // @todo make base font-size 14px
  },
};

type LocalState = {
  blockState: BlockState;
  selectedPullRequestId?: PullRequestIdentifier;
  githubEntityTypeIds?: { [key in GITHUB_ENTITY_TYPES]: string };
  allPrs?: Map<string, GithubPullRequestEntityType>;
  pullRequest?: GithubPullRequestEntityType;
  reviews: GithubReviewEntityType["properties"][];
  events: GithubIssueEventEntityType["properties"][];
  infoMessage: string;
};

type Action<S, T = undefined> = T extends undefined
  ? { type: S }
  : {
      type: S;
      payload: T;
    };

type Actions =
  | Action<"UPDATE_STATE", Partial<LocalState>>
  | Action<"RESET_SELECTED_PR">;

const reducer = (state: LocalState, action: Actions): LocalState => {
  switch (action.type) {
    case "UPDATE_STATE":
      return {
        ...state,
        ...action.payload,
      };

    case "RESET_SELECTED_PR":
      return {
        ...state,
        selectedPullRequestId: undefined,
        blockState: BlockState.Selector,
        pullRequest: undefined,
        events: [],
        reviews: [],
      };

    default:
      return state;
  }
};

const getInitialState = (options: Partial<LocalState>) => ({
  blockState: BlockState.Loading,
  githubEntityTypeIds: undefined,
  allPrs: new Map(),
  pullRequest: undefined,
  infoMessage: "",
  reviews: [],
  events: [],
  ...options,
});

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: { blockEntity },
}) => {
  const blockRef = React.useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);
  const {
    entityId,
    // selectedPullRequest is just an Identifier, but isn't the associated GithubPullRequestEntity
    properties: { selectedPullRequest: remoteSelectedPullRequestId },
  } = blockEntity;
  const [
    {
      blockState,
      selectedPullRequestId,
      allPrs,
      pullRequest,
      reviews,
      events,
      githubEntityTypeIds,
      infoMessage,
    },
    dispatch,
  ] = React.useReducer<React.Reducer<LocalState, Actions>>(
    reducer,
    getInitialState({
      selectedPullRequestId: remoteSelectedPullRequestId,
    }),
  );

  const setSelectedPullRequestIdAndPersist = (
    pullRequestId?: PullRequestIdentifier,
  ) => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: {
          selectedPullRequest: pullRequestId,
        },
      },
    });

    dispatch({
      type: "UPDATE_STATE",
      payload: { selectedPullRequestId: pullRequestId },
    });
  };

  const resetPRInfo = () => {
    void graphService?.updateEntity({
      data: {
        entityId,
        properties: {
          selectedPullRequest: undefined,
        },
      },
    });

    dispatch({ type: "RESET_SELECTED_PR" });
  };

  const fetchGithubEntityTypeIds = React.useCallback(async () => {
    if (!graphService) return;

    dispatch({
      type: "UPDATE_STATE",
      payload: { blockState: BlockState.Loading },
    });

    try {
      const entityTypeIds = await getGithubEntityTypes(({ data }) =>
        graphService.aggregateEntityTypes({ data }),
      );

      const prs = await getAllPRs(
        entityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        ({ data }) => graphService.aggregateEntities({ data }),
      );

      dispatch({
        type: "UPDATE_STATE",
        payload: {
          allPrs: prs,
          githubEntityTypeIds: entityTypeIds,
          blockState: BlockState.Selector,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log({ err });
      // confirm if we need this
      dispatch({
        type: "UPDATE_STATE",
        payload: { blockState: BlockState.Error },
      });
    }
  }, [graphService]);

  React.useEffect(() => {
    if (
      JSON.stringify(remoteSelectedPullRequestId) !==
      JSON.stringify(selectedPullRequestId)
    ) {
      dispatch({
        type: "UPDATE_STATE",
        payload: { selectedPullRequestId: remoteSelectedPullRequestId },
      });
    }
  }, [remoteSelectedPullRequestId, selectedPullRequestId]);

  React.useEffect(() => {
    if (!blockRef.current) return;
    // fetch entity types
    if (!githubEntityTypeIds) {
      void fetchGithubEntityTypeIds();
    }
  }, [githubEntityTypeIds, fetchGithubEntityTypeIds]);

  React.useEffect(() => {
    if (!blockRef.current) return;
    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined &&
      graphService?.aggregateEntities
    ) {
      // @todo test loading flows
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          blockState: BlockState.Loading,
          infoMessage: `Creating your timeline for pull request ${selectedPullRequestId}`,
        },
      });

      void Promise.all([
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
      ])
        .then(([prReviews, prEvents]) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              reviews: prReviews.map((review) => ({ ...review.properties })),
              events: prEvents.map((event) => ({ ...event.properties })),
              blockState: BlockState.Overview,
            },
          });
        })
        .catch((err) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              blockState: BlockState.Error,
            },
          });
        });
    }
  }, [githubEntityTypeIds, selectedPullRequestId, graphService]);

  // Block has been initialized with a selected Pull Request, get associated info
  React.useEffect(() => {
    if (!blockRef.current) return;
    if (!graphService?.aggregateEntities) return;

    if (
      selectedPullRequestId !== undefined &&
      githubEntityTypeIds !== undefined
    ) {
      dispatch({
        type: "UPDATE_STATE",
        payload: { blockState: BlockState.Loading },
      });

      void getPrsPerPage(
        githubEntityTypeIds[GITHUB_ENTITY_TYPES.PullRequest],
        ({ data }) => graphService.aggregateEntities({ data }),
        1,
        selectedPullRequestId,
      ).then((pullRequests) => {
        if (pullRequests) {
          const pr = pullRequests.results?.[0];
          if (pr) {
            dispatch({
              type: "UPDATE_STATE",
              payload: { pullRequest: pr },
            });
          }
        }
      });
    }
  }, [githubEntityTypeIds, selectedPullRequestId, graphService]);

  /** @todo - Figure out when to query for more than one page, probably querying until no more results */

  const renderContent = () => {
    switch (blockState) {
      case BlockState.Loading:
        return <InfoUI title={infoMessage || "Setting up Block"} loading />;
      case BlockState.Overview:
        return (
          <GithubPrOverview
            pullRequest={pullRequest?.properties ?? {}}
            reviews={reviews}
            events={events}
            reset={resetPRInfo}
          />
        );
      case BlockState.Error:
        return <InfoUI title="An error occured" />;
      case BlockState.Selector:
      default:
        return (
          <PullRequestSelector
            setSelectedPullRequestId={setSelectedPullRequestIdAndPersist}
            allPrs={allPrs!}
          />
        );
    }
  };

  // if (allPrs && allPrs.size > 0 && blockState === BlockState.Loading) {
  //   dispatch({
  //     type: "UPDATE_STATE",
  //     payload: { blockState: BlockState.Selector },
  //   });
  // } else if (
  //   selectedPullRequestId !== undefined &&
  //   pullRequest !== undefined &&
  //   reviews !== undefined &&
  //   events !== undefined &&
  //   blockState !== BlockState.Overview
  // ) {
  //   dispatch({
  //     type: "UPDATE_STATE",
  //     payload: { blockState: BlockState.Overview },
  //   });
  // }

  /** @todo - Filterable list to select a pull-request */
  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Box p={2} ref={blockRef}>
        {renderContent()}
      </Box>
    </ThemeProvider>
  );
};
