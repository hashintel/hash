import { useMutation } from "@apollo/client";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import type {
  GetLinearOrganizationQuery,
  SyncLinearIntegrationWithWebsMutation,
  SyncLinearIntegrationWithWebsMutationVariables,
} from "../../../graphql/api-types.gen";
import { syncLinearIntegrationWithWebsMutation } from "../../../graphql/queries/integrations/linear.queries";
import type { NextPageWithLayout } from "../../../shared/layout";
import { Button } from "../../../shared/ui";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import { SettingsPageContainer } from "../shared/settings-page-container";
import { LinearHeader } from "./linear/linear-header";
import type { LinearOrganizationTeamsWithWebs } from "./linear/select-linear-teams-table";
import {
  mapLinearOrganizationToLinearOrganizationTeamsWithWebs,
  mapLinearOrganizationToSyncWithWebsInputVariable,
  SelectLinearTeamsTable,
} from "./linear/select-linear-teams-table";
import type { LinearIntegration } from "./linear/use-linear-integrations";
import { useLinearIntegrations } from "./linear/use-linear-integrations";

const DataAccess: FunctionComponent<{
  linearIntegrations: LinearIntegration[];
  connectedLinearOrganizations: GetLinearOrganizationQuery["getLinearOrganization"][];
}> = ({ linearIntegrations, connectedLinearOrganizations }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const router = useRouter();

  const [
    syncLinearIntegrationWithWebs,
    { loading: loadingSyncLinearIntegrationWithWorkspaces },
  ] = useMutation<
    SyncLinearIntegrationWithWebsMutation,
    SyncLinearIntegrationWithWebsMutationVariables
  >(syncLinearIntegrationWithWebsMutation, { awaitRefetchQueries: true });

  const possibleWorkspaces = useMemo(
    () => [
      authenticatedUser,
      ...authenticatedUser.memberOf.map(({ org }) => org),
    ],
    [authenticatedUser],
  );

  const [linearOrganizations, setLinearOrganizations] = useState<
    LinearOrganizationTeamsWithWebs[]
  >(
    connectedLinearOrganizations.map(
      mapLinearOrganizationToLinearOrganizationTeamsWithWebs({
        linearIntegrations,
      }),
    ),
  );

  const handleSave = useCallback(async () => {
    await Promise.all(
      linearIntegrations.map(({ entity }) => {
        const { linearOrgId } = simplifyProperties(entity.properties);

        const linearOrganization = linearOrganizations.find(
          ({ id }) => id === linearOrgId,
        )!;

        return syncLinearIntegrationWithWebs({
          variables: {
            linearIntegrationEntityId: entity.metadata.recordId.entityId,
            syncWithWebs: mapLinearOrganizationToSyncWithWebsInputVariable({
              linearOrganization,
              possibleWebs: possibleWorkspaces,
            }),
          },
        });
      }),
    );

    void router.push("/settings/integrations");
  }, [
    syncLinearIntegrationWithWebs,
    linearOrganizations,
    linearIntegrations,
    possibleWorkspaces,
    router,
  ]);

  return (
    <Box py={3} px={4}>
      <Typography variant="smallTextParagraphs">
        The contents of <strong>Linear Workspaces</strong> which are visible to
        you can be made available to one or more <strong>HASH webs</strong> you
        belong to. Access can also be granted on a{" "}
        <strong>per-Linear Team</strong> basis.
      </Typography>
      <Box my={2}>
        <SelectLinearTeamsTable
          linearOrganizations={linearOrganizations}
          setLinearOrganizations={setLinearOrganizations}
        />
      </Box>
      <Box display="flex" justifyContent="flex-end">
        <Button
          loading={loadingSyncLinearIntegrationWithWorkspaces}
          onClick={handleSave}
          size="small"
        >
          Save changes
        </Button>
      </Box>
    </Box>
  );
};

const LinearIntegrationsPage: NextPageWithLayout = () => {
  const { linearIntegrations, connectedLinearOrganizations } =
    useLinearIntegrations();

  return (
    <SettingsPageContainer
      heading={<LinearHeader />}
      sectionLabel="Data access"
    >
      {connectedLinearOrganizations.length > 0 ? (
        <>
          {/* <LinearConnections
            connectedLinearOrganizations={connectedLinearOrganizations}
          /> */}
          {linearIntegrations.length > 0 ? (
            <DataAccess
              linearIntegrations={linearIntegrations}
              connectedLinearOrganizations={connectedLinearOrganizations}
            />
          ) : null}
        </>
      ) : null}
    </SettingsPageContainer>
  );
};

LinearIntegrationsPage.getLayout = (page) => getSettingsLayout(page);
export default LinearIntegrationsPage;
