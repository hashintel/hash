import { useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  deserializeQueryEntitySubgraphResponse,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntitiesCount } from "../../shared/draft-entities-count-context";
import { usePollInterval } from "../../shared/use-poll-interval";
import { useAuthInfo } from "../shared/auth-info-context";

export type DraftEntitiesContextValue = {
  draftEntities?: HashEntity[];
  draftEntitiesSubgraph?: Subgraph<EntityRootType>;
  loading: boolean;
  refetch: () => Promise<void>;
};

export const DraftEntitiesContext =
  createContext<null | DraftEntitiesContextValue>(null);

export const useDraftEntities = () => {
  const draftEntitiesContext = useContext(DraftEntitiesContext);

  if (!draftEntitiesContext) {
    throw new Error("Context missing");
  }

  return draftEntitiesContext;
};

/**
 * Context to provide full information of draft entities, for use in the actions page.
 * A separate app-wide context provides simply a count of draft entities.
 */
export const DraftEntitiesContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const [
    previouslyFetchedDraftEntitiesData,
    setPreviouslyFetchedDraftEntitiesData,
  ] = useState<QueryEntitySubgraphQuery>();

  const { authenticatedUser } = useAuthInfo();

  const { refetch: refetchDraftEntitiesCount } = useDraftEntitiesCount();

  const pollInterval = usePollInterval();

  const {
    data: draftEntitiesData,
    refetch: refetchFullData,
    loading,
  } = useQuery<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>(
    queryEntitySubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            all: [
              {
                not: {
                  exists: {
                    path: ["draftId"],
                  },
                },
              },
              {
                equal: [{ path: ["archived"] }, { parameter: false }],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          graphResolveDepths: zeroedGraphResolveDepths,
          includeDrafts: true,
          includePermissions: false,
        },
      },
      onCompleted: (data) => setPreviouslyFetchedDraftEntitiesData(data),
      pollInterval,
      fetchPolicy: "network-only",
      skip: !authenticatedUser,
    },
  );

  const draftEntitiesSubgraph = useMemo(
    () =>
      (draftEntitiesData ?? previouslyFetchedDraftEntitiesData)
        ? deserializeQueryEntitySubgraphResponse(
            (draftEntitiesData ?? previouslyFetchedDraftEntitiesData)!
              .queryEntitySubgraph,
          ).subgraph
        : undefined,
    [draftEntitiesData, previouslyFetchedDraftEntitiesData],
  );

  const draftEntities = useMemo(
    () => (draftEntitiesSubgraph ? getRoots(draftEntitiesSubgraph) : undefined),
    [draftEntitiesSubgraph],
  );

  const value = useMemo<DraftEntitiesContextValue>(
    () => ({
      draftEntities,
      draftEntitiesSubgraph,
      loading,
      refetch: async () => {
        await refetchFullData();
        await refetchDraftEntitiesCount();
      },
    }),
    [
      draftEntities,
      draftEntitiesSubgraph,
      loading,
      refetchFullData,
      refetchDraftEntitiesCount,
    ],
  );

  return (
    <DraftEntitiesContext.Provider value={value}>
      {children}
    </DraftEntitiesContext.Provider>
  );
};
