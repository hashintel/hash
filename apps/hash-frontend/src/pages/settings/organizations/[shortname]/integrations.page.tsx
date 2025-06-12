import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SyncLinearDataWith } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import {
  Box,
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
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { LinearLogo } from "../../../../shared/icons/linear-logo";
import type { NextPageWithLayout } from "../../../../shared/layout";
import { Link } from "../../../../shared/ui";
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

  const { data: linearIntegrationSyncLinksData, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
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
      },
      includePermissions: true,
    },
    skip: !org,
    fetchPolicy: "cache-and-network",
  });

  const linearIntegrationLinks = useMemo(() => {
    if (!linearIntegrationSyncLinksData) {
      return [];
    }

    const { userPermissionsOnEntities, subgraph } =
      linearIntegrationSyncLinksData.getEntitySubgraph;

    const mappedSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<HashEntity<SyncLinearDataWith>>
      >(subgraph);

    const links = getRoots(mappedSubgraph);

    return links.map(({ entityId }) => {
      const canEdit = !!userPermissionsOnEntities?.[entityId]?.edit;

      return {
        entityId,
        canEdit,
      };
    });
  }, [linearIntegrationSyncLinksData]);

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
        {linearIntegrationLinks.length === 0 ? (
          <Box mt={2}>
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
                <SettingsTableCell sx={{ width: 100 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {linearIntegrationLinks.map(({ entityId, canEdit }) => (
                <TableRow key={entityId}>
                  <SettingsTableCell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <LinearLogo sx={{ fontSize: 14 }} />
                      Linear
                    </Stack>
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
              ))}
            </TableBody>
          </SettingsTable>
        )}
      </SettingsPageContainer>
    </>
  );
};

OrgIntegrationsPage.getLayout = (page) => getSettingsLayout(page);

export default OrgIntegrationsPage;
