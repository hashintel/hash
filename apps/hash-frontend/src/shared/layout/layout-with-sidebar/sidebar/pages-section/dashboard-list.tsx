import { useQuery } from "@apollo/client";
import { faChartColumn } from "@fortawesome/free-solid-svg-icons";
import { Box, Skeleton, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { querySidebarDashboardsQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { Button } from "../../../../ui/button";
import { TopNavLink } from "../top-nav-link";

import type {
  QuerySidebarDashboardsQuery,
  QuerySidebarDashboardsQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { WebId } from "@blockprotocol/type-system";
import type { Dashboard } from "@local/hash-isomorphic-utils/system-types/dashboard";

const dashboardNameBaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/" satisfies keyof Dashboard["properties"];

export const DashboardList = ({ webId }: { webId: WebId }) => {
  const router = useRouter();
  const { data, loading, error, refetch } = useQuery<
    QuerySidebarDashboardsQuery,
    QuerySidebarDashboardsQueryVariables
  >(querySidebarDashboardsQuery, {
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: systemEntityTypes.dashboard.entityTypeId },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: { inheritsFrom: 0, isOfType: false },
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const dashboards = useMemo(() => {
    if (!data) {
      return [];
    }

    const { subgraph } = deserializeQueryEntitySubgraphResponse<Dashboard>(
      data.queryEntitySubgraph,
    );

    return getRoots(subgraph)
      .flatMap((entity) => {
        // The type says the name is a string; stored data is not guaranteed to
        // match it, so one malformed dashboard must not break the list.
        const title: unknown = entity.properties[dashboardNameBaseUrl];

        if (typeof title !== "string") {
          return [];
        }

        return [{ entityId: entity.metadata.recordId.entityId, title }];
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [data]);

  return (
    <>
      {loading && !data && (
        <Box role="status" aria-label="Loading dashboards" sx={{ px: 2.25 }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
        </Box>
      )}
      {error && (
        <Box role="alert" sx={{ px: 2.25, py: 1 }}>
          <Typography variant="smallTextLabels">
            Could not load dashboards.
          </Typography>
          <Button
            size="xs"
            variant="tertiary_quiet"
            disabled={loading}
            onClick={() => {
              void refetch().catch(() => undefined);
            }}
          >
            Try again
          </Button>
        </Box>
      )}
      {dashboards.map(({ entityId, title }) => {
        const href = `/dashboard/${extractEntityUuidFromEntityId(entityId)}`;

        return (
          <TopNavLink
            key={entityId}
            title={title}
            href={href}
            icon={<FontAwesomeIcon icon={faChartColumn} />}
            active={router.asPath.split(/[?#]/)[0] === href}
            tooltipTitle={title}
          />
        );
      })}
    </>
  );
};
