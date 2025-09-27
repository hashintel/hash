import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SyncLinearDataWith } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import {
  Box,
  Skeleton,
  Stack,
  TableBody,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useMemo } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { LinearLogo } from "../../../../shared/icons/linear-logo";
import type { NextPageWithLayout } from "../../../../shared/layout";
import { Link } from "../../../../shared/ui";
import { useActors } from "../../../../shared/use-actors";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import { SettingsTable } from "../../shared/settings-table";
import { SettingsTableCell } from "../../shared/settings-table-cell";
import { OrgIntegrationContextMenu } from "./integrations.page/org-integrations-context-menu";

const OrgIntegrationsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { shortname } = router.query as { shortname: string };

  const { authenticatedUser } = useAuthenticatedUser();

  const org = authenticatedUser.memberOf.find(
    ({ org: orgOption }) => orgOption.shortname === shortname,
  )?.org;

  const {
    data: linearIntegrationSyncLinksData,
    loading,
    refetch,
  } = useQuery<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>(
    queryEntitySubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            all: [
              generateVersionedUrlMatchingFilter(
                systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
              ),
              {
                equal: [
                  {
                    path: ["rightEntity", "webId"],
                  },
                  {
                    parameter: org!.webId,
                  },
                ],
              },
              {
                equal: [
                  {
                    path: ["archived"],
                  },
                  { parameter: false },
                ],
              },
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          includeDrafts: false,
          temporalAxes: currentTimeInstantTemporalAxes,
          includePermissions: true,
        },
      },
      skip: !org,
      fetchPolicy: "cache-and-network",
    },
  );

  const linearIntegrationLinks = useMemo(() => {
    if (!linearIntegrationSyncLinksData) {
      return [];
    }

    const { entityPermissions, subgraph } =
      deserializeQueryEntitySubgraphResponse<SyncLinearDataWith>(
        linearIntegrationSyncLinksData.queryEntitySubgraph,
      );

    const links = getRoots(subgraph);

    return links.map(({ metadata, entityId }) => {
      const canEdit = !!entityPermissions?.[entityId]?.edit;

      return {
        createdById: metadata.provenance.createdById,
        entityId,
        canEdit,
      };
    });
  }, [linearIntegrationSyncLinksData]);

  const { actors } = useActors({
    accountIds: linearIntegrationLinks.map(({ createdById }) => createdById),
  });

  if (!org) {
    // @todo show a 404 page
    void router.push("/settings/organizations");
    return null;
  }

  return (
    <>
      <NextSeo title={`${org.name} | Integrations`} />

      <SettingsPageContainer
        heading={org.name}
        sectionLabel="Integrations"
        disableContentWrapper={linearIntegrationLinks.length === 0}
      >
        {loading ? (
          <Stack p={1}>
            <Skeleton sx={{ height: 40, transform: "none", mb: 1 }} />
            <Skeleton sx={{ height: 40, transform: "none", mb: 1 }} />
            <Skeleton sx={{ height: 40, transform: "none" }} />
          </Stack>
        ) : linearIntegrationLinks.length === 0 ? (
          <Box py={2} px={3}>
            <Typography variant="smallTextParagraphs">
              No integrations found for {org.name} – install them{" "}
              <Link href="/settings/integrations">here</Link>.
            </Typography>
          </Box>
        ) : (
          <SettingsTable>
            <TableHead>
              <TableRow>
                <SettingsTableCell>Source type</SettingsTableCell>
                <SettingsTableCell>Installed by</SettingsTableCell>
                <SettingsTableCell sx={{ width: 100 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {linearIntegrationLinks.map(
                ({ entityId, canEdit, createdById }) => {
                  const actor = actors?.find(
                    ({ accountId }) => accountId === createdById,
                  );

                  const isUser = actor && "shortname" in actor;

                  return (
                    <TableRow key={entityId}>
                      <SettingsTableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <LinearLogo sx={{ fontSize: 14 }} />
                          Linear
                        </Stack>
                      </SettingsTableCell>
                      <SettingsTableCell>
                        {isUser ? (
                          <Link
                            href={`/@${actor.shortname}`}
                            sx={{ textDecoration: "none" }}
                          >
                            {actor.displayName}
                          </Link>
                        ) : (
                          actor?.displayName
                        )}
                      </SettingsTableCell>
                      <SettingsTableCell>
                        {canEdit && (
                          <OrgIntegrationContextMenu
                            linkEntityId={entityId}
                            onUninstall={refetch}
                          />
                        )}
                      </SettingsTableCell>
                    </TableRow>
                  );
                },
              )}
            </TableBody>
          </SettingsTable>
        )}
      </SettingsPageContainer>
    </>
  );
};

OrgIntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default OrgIntegrationsPage;
