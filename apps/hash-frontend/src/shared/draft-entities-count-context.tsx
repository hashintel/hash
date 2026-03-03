import { useQuery } from "@apollo/client";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";

import type {
  CountEntitiesQuery,
  CountEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { countEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { usePollInterval } from "./use-poll-interval";

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

  const pollInterval = usePollInterval();

  const {
    data: draftEntitiesData,
    refetch,
    loading,
  } = useQuery<CountEntitiesQuery, CountEntitiesQueryVariables>(
    countEntitiesQuery,
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
          includeDrafts: true,
        },
      },
      pollInterval,
      fetchPolicy: "network-only",
      skip: !authenticatedUser?.accountSignupComplete,
    },
  );

  const value = useMemo<DraftEntitiesCountContextValue>(
    () => ({
      count: draftEntitiesData?.countEntities ?? undefined,
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
