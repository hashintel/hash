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
        selectedPullRequestIdentifier: undefined,
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
    properties: { selectedPullRequest: remoteSelectedPullRequestIdentifier },
  } = blockEntity;
  const [
    {
      blockState,
      selectedPullRequestIdentifier,
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
      selectedPullRequestIdentifier: remoteSelectedPullRequestIdentifier,
    }),
  );
  const prevSelectedPullRequestIdRef = React.useRef(
    remoteSelectedPullRequestIdentifier,
  );
  if (
    prevSelectedPullRequestIdRef.current !== remoteSelectedPullRequestIdentifier
  ) {
    prevSelectedPullRequestIdRef.current = remoteSelectedPullRequestIdentifier;
    dispatch({
      type: "UPDATE_STATE",
      payload: {
        selectedPullRequestIdentifier: remoteSelectedPullRequestIdentifier,
      },
    });
  }

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
      payload: { selectedPullRequestIdentifier: pullRequestId },
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
    if (selectedPullRequestIdentifier && githubEntityTypeIds) {
      dispatch({
        type: "UPDATE_STATE",
        payload: {
          blockState: BlockState.Loading,
          infoMessage: `Creating your timeline for pull request #${selectedPullRequestIdentifier.number}`,
        },
      });

      void getPrDetails(
        selectedPullRequestIdentifier,
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
  }, [githubEntityTypeIds, selectedPullRequestIdentifier, graphService]);

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
        return <InfoUI title={infoMessage || "An error occured"} />;
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

  if (!selectedPullRequestIdentifier && blockState === BlockState.Overview) {
    dispatch({
      type: "UPDATE_STATE",
      payload: { blockState: BlockState.Selector },
    });
  }

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <Box p={{ xs: 0, sm: 2 }} ref={blockRef}>
        {renderContent()}
      </Box>
    </ThemeProvider>
  );
};
