import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity } from "@local/hash-subgraph/.";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
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
      const { data: subgraph } = await queryEntities({
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
                  value: systemTypes.entityType.linearIntegration.entityTypeId,
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

      if (subgraph) {
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
                      systemTypes.linkEntityType.syncLinearDataWith
                        .linkEntityTypeId && !linkEntity.metadata.archived
                  );
                })
                .map((linkAndTarget) => {
                  const linkEntity = linkAndTarget.linkEntity[0]!;
                  const rightEntity = linkAndTarget.rightEntity[0]!;

                  const linearTeamIds = linkEntity.properties[
                    extractBaseUrl(
                      systemTypes.propertyType.linearTeamId.propertyTypeId,
                    )
                  ] as string[];

                  return {
                    workspaceEntity: rightEntity,
                    linearTeamIds,
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
