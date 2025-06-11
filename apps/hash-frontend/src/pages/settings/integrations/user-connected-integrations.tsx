import { useQuery } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { pageEntityTypeFilter } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { Typography } from "@mui/material";
import { type FunctionComponent, useContext } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  queryEntitiesQuery,
} from "../../../graphql/queries/knowledge/entity.queries";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../../shared/filters";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { WorkspaceContext } from "../../shared/workspace-context";

export const UserConnectedIntegrations = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { accountId } = authenticatedUser;

  const { data, loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.integration.entityTypeId,
            ),
            ,
            {
              equal: [{ path: ["webId"] }, { parameter: accountId }],
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const { queryEntities: subgraphAndPermissions } = data ?? {};
  return (
    <Typography variant="mediumCaps" mb={2} component="div">
      Existing integrations
    </Typography>
  );
};
