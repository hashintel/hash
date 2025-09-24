import { useLazyQuery, useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { Entity } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
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
import { useEffect, useMemo, useState } from "react";

import type {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getLinearOrganizationQuery } from "../../../../graphql/queries/integrations/linear.queries";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
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

  const { data: linearIntegrationsData } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: ["webId"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: systemEntityTypes.linearIntegration.entityTypeId },
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { outgoing: 0, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
  });

  const [getLinearOrganization] = useLazyQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery);

  const [connectedLinearOrganizations, setConnectedLinearOrganizations] =
    useState<GetLinearOrganizationQuery["getLinearOrganization"][]>([]);

  const linearIntegrations = useMemo(() => {
    if (!linearIntegrationsData) {
      return [];
    }

    const subgraph = linearIntegrationsData.queryEntitySubgraph.subgraph;

    const mappedSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<HashEntity<LinearIntegrationType>>
      >(subgraph);

    const linearIntegrationEntities = getRoots(mappedSubgraph);

    return linearIntegrationEntities.map((entity) => {
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
    });
  }, [linearIntegrationsData]);

  useEffect(() => {
    void (async () => {
      if (linearIntegrations.length) {
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
