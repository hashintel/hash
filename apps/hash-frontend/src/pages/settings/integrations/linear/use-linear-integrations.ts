import { useLazyQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { Entity } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  LinearIntegration as LinearIntegrationType,
  SyncLinearDataWithProperties,
} from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type {
  OrganizationProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/user";
import { useEffect, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import type {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getLinearOrganizationQuery } from "../../../../graphql/queries/integrations/linear.queries";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";

export type LinearIntegration = {
  entity: Entity<LinearIntegrationType>;
  syncedWithWebs: {
    webEntity: Entity;
    webName: string;
    linearTeamIds: string[];
  }[];
};

export const useLinearIntegrations = (): {
  linearIntegrations: LinearIntegration[];
  connectedLinearOrganizations: GetLinearOrganizationQuery["getLinearOrganization"][];
} => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { queryEntities } = useBlockProtocolQueryEntities();

  const [linearIntegrations, setLinearIntegrations] = useState<
    LinearIntegration[]
  >([]);

  const [getLinearOrganization] = useLazyQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery);

  const [connectedLinearOrganizations, setConnectedLinearOrganizations] =
    useState<GetLinearOrganizationQuery["getLinearOrganization"][]>([]);

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

        const linearIntegrationEntities = getRoots(
          subgraph as Subgraph<
            EntityRootType<HashEntity<LinearIntegrationType>>
          >,
        );

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

                  const webName = rightEntity.metadata.entityTypeIds.includes(
                    systemEntityTypes.user.entityTypeId,
                  )
                    ? (rightEntity.properties as UserProperties)[
                        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
                      ]!
                    : (rightEntity.properties as OrganizationProperties)[
                        "https://hash.ai/@h/types/property-type/organization-name/"
                      ];

                  return {
                    webEntity: rightEntity,
                    webName,
                    linearTeamIds: linearTeamIds ?? [],
                  };
                }),
            };
          }),
        );
      }
    })();
  }, [queryEntities, authenticatedUser]);

  useEffect(() => {
    void (async () => {
      if (linearIntegrations.length > 0) {
        const linearOrganizations = await Promise.all(
          linearIntegrations.map(async ({ entity }) => {
            const { linearOrgId } = simplifyProperties(entity.properties);

            const { data } = await getLinearOrganization({
              variables: { linearOrgId },
            });

            if (data) {
              return data.getLinearOrganization;
            } else {
              throw new Error("Could not get linear organization");
            }
          }),
        );

        setConnectedLinearOrganizations(linearOrganizations);
      }
    })();
  }, [linearIntegrations, getLinearOrganization]);

  return { linearIntegrations, connectedLinearOrganizations };
};
