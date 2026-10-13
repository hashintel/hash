import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { summarizeEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import {
  DraftEntitiesCountContext,
  type DraftEntitiesCountContextValue,
} from "./draft-entities-count-context";
import { usePollInterval } from "./use-poll-interval";

import type {
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import type { FunctionComponent, PropsWithChildren } from "react";

export const DraftEntitiesCountContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const pollInterval = usePollInterval();

  const {
    data: draftEntitiesData,
    refetch,
    loading,
  } = useQuery<SummarizeEntitiesQuery, SummarizeEntitiesQueryVariables>(
    summarizeEntitiesQuery,
    {
      variables: {
        request: {
          filter: {
            all: [
              {
                exists: {
                  path: ["draftId"],
                },
              },
              {
                equal: [{ path: ["archived"] }, { parameter: false }],
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: true,
          includeCount: true,
        },
      },
      pollInterval,
      fetchPolicy: "network-only",
      skip: !authenticatedUser?.accountSignupComplete,
    },
  );

  const value = useMemo<DraftEntitiesCountContextValue>(
    () => ({
      count: draftEntitiesData?.summarizeEntities.count ?? undefined,
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
