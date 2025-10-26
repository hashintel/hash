import { useQuery } from "@apollo/client";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import {
  deserializeQueryEntitiesResponse,
  type SerializedQueryEntitiesResponse,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitiesQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Machine } from "@local/hash-isomorphic-utils/system-types/machine";
import { useMemo } from "react";

import { useUsers } from "../components/hooks/use-users";
import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import type { MinimalUser } from "../lib/user-and-org";

type MachineActor = {
  accountId: ActorEntityUuid;
  kind: "machine";
  displayName: string;
};

export const isAiMachineActor = (actor: MachineActor): actor is MachineActor =>
  actor.displayName.toLowerCase() === "hash ai";

export type MinimalActor = MinimalUser | MachineActor;

export const useActors = (params: {
  accountIds?: ActorEntityUuid[];
}): { actors?: MinimalActor[]; loading: boolean } => {
  const { accountIds } = params;

  const { users, loading: usersLoading } = useUsers();

  const userActors = useMemo(
    () => users?.filter((user) => accountIds?.includes(user.accountId)),
    [users, accountIds],
  );

  const { data: machineActorsData, loading: machinesLoading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: {
          any: (params.accountIds ? [...new Set(params.accountIds)] : []).map(
            (accountId) => ({
              all: [
                {
                  equal: [
                    { path: ["editionProvenance", "createdById"] },
                    { parameter: accountId },
                  ],
                },
                generateVersionedUrlMatchingFilter(
                  systemEntityTypes.machine.entityTypeId,
                  { ignoreParents: true },
                ),
              ],
            }),
          ),
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-first",
    skip: !accountIds?.length,
  });

  const actors = useMemo(() => {
    if (accountIds && accountIds.length === 0) {
      return [];
    }
    if (!machineActorsData || !userActors) {
      return;
    }

    const entities = deserializeQueryEntitiesResponse(
      machineActorsData.queryEntities as SerializedQueryEntitiesResponse<Machine>,
    ).entities;

    const machineActors = entities.map((entity) => {
      return {
        accountId: entity.metadata.provenance.edition.createdById,
        kind: "machine" as const,
        displayName:
          entity.properties[
            "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
          ],
      };
    });

    return [...machineActors, ...userActors];
  }, [userActors, machineActorsData, accountIds]);

  return {
    actors,
    loading: usersLoading || machinesLoading,
  };
};
