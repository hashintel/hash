import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { pollInterval } from "./poll-interval";

export type DraftEntitiesCountContextValue = {
  count?: number;
  loading: boolean;
  refetch: () => Promise<void>;
};

export const DraftEntitiesCountContext =
  createContext<null | DraftEntitiesCountContextValue>(null);

export const useDraftEntitiesCount = () => {
  const draftEntitiesContext = useContext(DraftEntitiesCountContext);

  if (!draftEntitiesContext) {
    throw new Error("DraftEntitiesCountContext missing");
  }

  return draftEntitiesContext;
};

export const DraftEntitiesCountContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const {
    data: draftEntitiesData,
    refetch,
    loading,
  } = useQuery<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            all: [
              {
                // @ts-expect-error -- Support null in Path parameter in structural queries in Node
                //                     @see https://linear.app/hash/issue/H-1207
                notEqual: [{ path: ["draftId"] }, null],
              },
              {
                equal: [{ path: ["archived"] }, { parameter: false }],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          graphResolveDepths: zeroedGraphResolveDepths,
          includeCount: true,
          includeDrafts: true,
          limit: 0,
        },
        includePermissions: false,
      },
      pollInterval,
      fetchPolicy: "network-only",
      skip: !authenticatedUser,
    },
  );

  const value = useMemo<DraftEntitiesCountContextValue>(
    () => ({
      count: draftEntitiesData?.getEntitySubgraph.count ?? undefined,
      loading,
      refetch: async () => {
        await refetch();
      },
    }),
    [draftEntitiesData, loading, refetch],
  );

  return (
    <DraftEntitiesCountContext.Provider value={value}>
      {children}
    </DraftEntitiesCountContext.Provider>
  );
};