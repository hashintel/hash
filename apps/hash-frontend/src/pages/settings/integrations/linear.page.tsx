import { useLazyQuery, useMutation } from "@apollo/client";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { LinearIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  SyncLinearIntegrationWithWebsMutation,
  SyncLinearIntegrationWithWebsMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  getLinearOrganizationQuery,
  syncLinearIntegrationWithWebsMutation,
} from "../../../graphql/queries/integrations/linear.queries";
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

const LinearConnections: FunctionComponent<{
  connectedLinearOrganizations: GetLinearOrganizationQuery["getLinearOrganization"][];
}> = ({ connectedLinearOrganizations }) => {
  return (
    <>
      <Typography variant="h5">Linear Connections</Typography>
      {connectedLinearOrganizations.map(({ id, name }) => (
        <Typography key={id}>Linear workspace: {name}</Typography>
      ))}
    </>
  );
};

const DataAccess: FunctionComponent<{
  linearIntegrations: LinearIntegration[];
  connectedLinearOrganizations: GetLinearOrganizationQuery["getLinearOrganization"][];
}> = ({ linearIntegrations, connectedLinearOrganizations }) => {
  const { authenticatedUser } = useAuthenticatedUser();

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
        const { linearOrgId } = simplifyProperties(
          entity.properties as LinearIntegrationProperties,
        );

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
  }, [
    syncLinearIntegrationWithWebs,
    linearOrganizations,
    linearIntegrations,
    possibleWorkspaces,
  ]);

  return (
    <Box py={3} px={4}>
      <Typography variant="smallTextParagraphs">
        Once connected to HASH, the contents of{" "}
        <strong>Linear Workspaces</strong> which are visible to you can be made
        available to one or more <strong>HASH webs</strong> you belong to.
        Access can also be granted on a <strong>per-Linear Team</strong> basis.
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
        >
          Save changes
        </Button>
      </Box>
    </Box>
  );
};

const LinearIntegrationsPage: NextPageWithLayout = () => {
  const { linearIntegrations } = useLinearIntegrations();

  const [getLinearOrganization] = useLazyQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery);

  const [connectedLinearOrganizations, setConnectedLinearOrganizations] =
    useState<GetLinearOrganizationQuery["getLinearOrganization"][]>();

  useEffect(() => {
    void (async () => {
      if (linearIntegrations) {
        const linearOrganizations = await Promise.all(
          linearIntegrations.map(async ({ entity }) => {
            const { linearOrgId } = simplifyProperties(
              entity.properties as LinearIntegrationProperties,
            );

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

  return (
    <SettingsPageContainer
      heading={<LinearHeader />}
      sectionLabel="Data access"
    >
      {connectedLinearOrganizations ? (
        <>
          {/* <LinearConnections
            connectedLinearOrganizations={connectedLinearOrganizations}
          /> */}
          {linearIntegrations ? (
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
