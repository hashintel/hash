import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { SyncLinearDataWithProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type { Entity } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useEffect, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

export type LinearIntegration = {
  entity: Entity;
  syncedWithWorkspaces: { workspaceEntity: Entity; linearTeamIds: string[] }[];
};

export const useLinearIntegrations = () => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { queryEntities } = useBlockProtocolQueryEntities();

  const [linearIntegrations, setLinearIntegrations] =
    useState<LinearIntegration[]>();

  useEffect(() => {
    void (async () => {
      const { data } = await queryEntities({
        data: {
          operation: {
            multiFilter: {
              filters: [
                {
                  field: ["ownedById"],
                  operator: "EQUALS",
                  value: authenticatedUser.accountId,
                },
                {
                  field: ["metadata", "entityTypeId"],
                  operator: "EQUALS",
                  value: systemEntityTypes.linearIntegration.entityTypeId,
                },
              ],
              operator: "AND",
            },
          },
          graphResolveDepths: {
            hasLeftEntity: { outgoing: 0, incoming: 1 },
            hasRightEntity: { outgoing: 1, incoming: 0 },
          },
        },
      });

      if (data) {
        const subgraph = data.results;

        const linearIntegrationEntities = getRoots(subgraph);

        setLinearIntegrations(
          linearIntegrationEntities.map((entity) => {
            return {
              entity,
              syncedWithWorkspaces: getOutgoingLinkAndTargetEntities(
                subgraph,
                entity.metadata.recordId.entityId,
              )
                .filter((linkAndTarget) => {
                  const linkEntity = linkAndTarget.linkEntity[0]!;

                  return (
                    linkEntity.metadata.entityTypeId ===
                      systemLinkEntityTypes.syncLinearDataWith
                        .linkEntityTypeId && !linkEntity.metadata.archived
                  );
                })
                .map((linkAndTarget) => {
                  const linkEntity = linkAndTarget.linkEntity[0]!;
                  const rightEntity = linkAndTarget.rightEntity[0]!;

                  const { linearTeamId: linearTeamIds } = simplifyProperties(
                    linkEntity.properties as SyncLinearDataWithProperties,
                  );

                  return {
                    workspaceEntity: rightEntity,
                    linearTeamIds: linearTeamIds ?? [],
                  };
                }),
            };
          }),
        );
      }
    })();
  }, [queryEntities, authenticatedUser]);

  return { linearIntegrations };
};
