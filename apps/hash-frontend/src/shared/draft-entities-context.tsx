import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph/.";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { pollInterval } from "./poll-interval";

export type DraftEntitiesContextValue = {
  draftEntities?: Entity[];
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

export const DraftEntitiesContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const [
    previouslyFetchedDraftEntitiesData,
    setPreviouslyFetchedDraftEntitiesData,
  ] = useState<StructuralQueryEntitiesQuery>();

  const { authenticatedUser } = useAuthInfo();

  const {
    data: draftEntitiesData,
    refetch,
    loading,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
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
        includeDrafts: true,
      },
      includePermissions: false,
    },
    onCompleted: (data) => setPreviouslyFetchedDraftEntitiesData(data),
    pollInterval,
    fetchPolicy: "network-only",
    skip: !authenticatedUser,
  });

  const draftEntitiesSubgraph = useMemo(
    () =>
      draftEntitiesData ?? previouslyFetchedDraftEntitiesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            (draftEntitiesData ?? previouslyFetchedDraftEntitiesData)!
              .structuralQueryEntities.subgraph,
          )
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
        await refetch();
      },
    }),
    [draftEntities, draftEntitiesSubgraph, loading, refetch],
  );

  return (
    <DraftEntitiesContext.Provider value={value}>
      {children}
    </DraftEntitiesContext.Provider>
  );
};
