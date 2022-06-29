import * as React from "react";

import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import { Box, CssBaseline, Theme, ThemeProvider } from "@mui/material";
import { theme } from "@hashintel/hash-design-system";
import {
  PullRequestIdentifier,
  BlockState,
  LocalState,
  Actions,
} from "./types";
import { GithubPrOverview } from "./overview";

import { getPrDetails, getEntityTypeIdsAndPrs } from "./entity-aggregations";
import { PullRequestSelector } from "./pull-request-selector";
import { InfoUI } from "./info-ui";

type BlockEntityProperties = {
  selectedPullRequest?: PullRequestIdentifier;
};

const customTheme: Theme = {
  ...theme,
  typography: {
    ...theme.typography,
    fontSize: 14,
    h1: {
      ...theme.typography.h1,
      fontSize: 32,
    },
    h2: {
      ...theme.typography.h2,
      fontSize: 24,
      fontWeight: 400,
    },
    body1: {
      ...theme.typography.body1,
      fontSize: 14,
    },
  },
};

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

  // Update local data if remote data changes
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
    if (!graphService) return;
    if (!githubEntityTypeIds || !allPrs) {
      dispatch({
        type: "UPDATE_STATE",
        payload: { blockState: BlockState.Loading },
      });

      void getEntityTypeIdsAndPrs(
        githubEntityTypeIds,
        ({ data }) => graphService.aggregateEntityTypes({ data }),
        ({ data }) => graphService.aggregateEntities({ data }),
      )
        .then(({ entityTypeIds, prs }) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              allPrs: prs,
              githubEntityTypeIds: entityTypeIds,
              blockState: BlockState.Selector,
            },
          });
        })
        .catch((err) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              blockState: BlockState.Error,
              infoMessage: err.message,
            },
          });
        });
    }
  }, [graphService, githubEntityTypeIds, allPrs]);

  // Fetch PR Details => pullRequest, events and reviews
  // if there's a selectedPullRequestId
  React.useEffect(() => {
    if (!blockRef.current || !graphService) return;
    // @todo add check to see if selectedPR is the same as current PR
    if (selectedPullRequestId && githubEntityTypeIds) {
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          blockState: BlockState.Loading,
          infoMessage: `Creating your timeline for pull request #${selectedPullRequestId.number}`,
        },
      });

      void getPrDetails(
        selectedPullRequestId,
        githubEntityTypeIds,
        ({ data }) => graphService?.aggregateEntities({ data }),
      )
        .then((data) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              pullRequest: data.pullRequest,
              reviews: data.reviews,
              events: data.events,
              blockState: BlockState.Overview,
            },
          });
        })
        .catch((err) => {
          dispatch({
            type: "UPDATE_STATE",
            payload: {
              blockState: BlockState.Error,
              infoMessage: err.message,
            },
          });
        });
    }
  }, [githubEntityTypeIds, selectedPullRequestId, graphService]);

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
            allPrs={allPrs}
          />
        );
    }
  };

  if (
    allPrs &&
    allPrs.size > 0 &&
    !selectedPullRequestId &&
    blockState === BlockState.Loading
  ) {
    dispatch({
      type: "UPDATE_STATE",
      payload: { blockState: BlockState.Selector },
    });
  } else if (
    selectedPullRequestId &&
    pullRequest &&
    reviews &&
    events &&
    blockState !== BlockState.Overview
  ) {
    dispatch({
      type: "UPDATE_STATE",
      payload: { blockState: BlockState.Overview },
    });
  }

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Box
        sx={({ palette }) => ({
          backgroundColor: palette.gray[20],
        })}
        p={2}
        ref={blockRef}
      >
        {renderContent()}
      </Box>
    </ThemeProvider>
  );
};
