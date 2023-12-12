import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { MachineProperties } from "@local/hash-isomorphic-utils/system-types/machine";
import { AccountId, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import { useUsers } from "../components/hooks/use-users";
import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { MinimalUser } from "../lib/user-and-org";

export type MinimalActor =
  | MinimalUser
  | {
      accountId: AccountId;
      kind: "machine";
      preferredName: string;
    };

export const useActors = (params: {
  accountIds?: AccountId[];
}): { actors?: MinimalActor[]; loading: boolean } => {
  const { accountIds } = params;

  const { users, loading: usersLoading } = useUsers();

  const userActors = users?.filter(
    (user) => accountIds?.includes(user.accountId),
  );

  const { data: machineActorsData, loading: machinesLoading } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          any: (params.accountIds ?? []).map((accountId) => ({
            all: [
              {
                equal: [{ path: ["uuid"] }, { parameter: accountId }],
              },
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.machine.entityTypeId,
                { ignoreParents: true },
              ),
            ],
          })),
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    fetchPolicy: "cache-first",
    skip: !accountIds?.length,
  });

  const actors = useMemo(() => {
    if (!machineActorsData || !userActors) {
      return;
    }

    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
      machineActorsData.structuralQueryEntities.subgraph,
    );

    const machineActors = getRoots(subgraph).map((entity) => {
      return {
        accountId: entity.metadata.provenance.recordCreatedById,
        kind: "machine" as const,
        preferredName: (entity.properties as MachineProperties)[
          blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl
        ],
      };
    });

    return [...machineActors, ...userActors];
  }, [userActors, machineActorsData]);

  return {
    actors,
    loading: usersLoading || machinesLoading,
  };
};
