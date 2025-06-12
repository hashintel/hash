import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { Entity } from "@blockprotocol/type-system";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { SyncLinearDataWithProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import { useEffect, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";

export type LinearIntegration = {
  entity: Entity;
  syncedWithWebs: {
    webEntity: Entity;
    linearTeamIds: string[];
  }[];
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
                  field: ["webId"],
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
              syncedWithWebs: getOutgoingLinkAndTargetEntities(
                subgraph,
                entity.metadata.recordId.entityId,
              )
                .filter((linkAndTarget) => {
                  const linkEntity = linkAndTarget.linkEntity[0]!;

                  return (
                    !linkEntity.metadata.archived &&
                    linkEntity.metadata.entityTypeIds.includes(
                      systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
                    )
                  );
                })
                .map((linkAndTarget) => {
                  const linkEntity = linkAndTarget.linkEntity[0]!;
                  const rightEntity = linkAndTarget.rightEntity[0]!;

                  const { linearTeamId: linearTeamIds } = simplifyProperties(
                    linkEntity.properties as SyncLinearDataWithProperties,
                  );

                  return {
                    webEntity: rightEntity,
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
