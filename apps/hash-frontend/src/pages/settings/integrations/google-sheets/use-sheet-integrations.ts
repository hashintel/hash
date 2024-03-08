import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  googleEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountProperties as GoogleAccountProperties,
  GoogleSheetsIntegrationProperties,
  QueryProperties,
} from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import { Entity, EntityRootType } from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";

export type UseSheetsIntegrationsData = {
  integrations: (Entity<GoogleSheetsIntegrationProperties> & {
    account: Entity<GoogleAccountProperties>;
    query: Entity<QueryProperties>;
  })[];
  loading: boolean;
  refetch: () => void;
};

export const useSheetsIntegrations = (): UseSheetsIntegrationsData => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.googleSheetsIntegration.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: { incoming: 0, outgoing: 1 },
          hasLeftEntity: { incoming: 1, outgoing: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.structuralQueryEntities.subgraph,
        )
      : undefined;

    if (!subgraph) {
      return {
        integrations: [],
        refetch,
        loading: true,
      };
    }

    const integrations = getRoots(
      subgraph,
    ) as Entity<GoogleSheetsIntegrationProperties>[];

    const integrationsWithAccounts = integrations.map((integration) => {
      const linkedEntities = getOutgoingLinkAndTargetEntities(
        subgraph,
        integration.metadata.recordId.entityId,
      );

      const accountEntity = linkedEntities.find(
        (linkAndTarget) =>
          linkAndTarget.rightEntity[0]?.metadata.entityTypeId ===
          googleEntityTypes.account.entityTypeId,
      )?.rightEntity[0];

      if (!accountEntity) {
        throw new Error(
          `Could not find Google account entity for integration with id ${integration.metadata.recordId.entityId}`,
        );
      }

      const queryEntity = linkedEntities.find(
        (linkAndTarget) =>
          linkAndTarget.rightEntity[0]?.metadata.entityTypeId ===
          blockProtocolEntityTypes.query.entityTypeId,
      )?.rightEntity[0];

      if (!queryEntity) {
        throw new Error(
          `Could not find query entity for integration with id ${integration.metadata.recordId.entityId}`,
        );
      }

      return {
        ...integration,
        account: accountEntity as Entity<GoogleAccountProperties>,
        query: queryEntity as Entity<QueryProperties>,
      };
    });

    return {
      integrations: integrationsWithAccounts,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
