import { useLazyQuery, useMutation } from "@apollo/client";
import { Button } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Container, Typography } from "@mui/material";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  SyncLinearIntegrationWithWorkspacesMutation,
  SyncLinearIntegrationWithWorkspacesMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  getLinearOrganizationQuery,
  syncLinearIntegrationWithWorkspacesMutation,
} from "../../../graphql/queries/integrations/linear.queries";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import {
  LinearOrganizationTeamsWithWorkspaces,
  mapLinearOrganizationToLinearOrganizationTeamsWithWorkspaces,
  mapLinearOrganizationToSyncWithWorkspacesInputVariable,
  SelectLinearTeamsTable,
} from "./select-linear-teams-table";
import {
  LinearIntegration,
  useLinearIntegrations,
} from "./use-linear-integrations";

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
    syncLinearIntegrationWithWorkspaces,
    { loading: loadingSyncLinearIntegrationWithWorkspaces },
  ] = useMutation<
    SyncLinearIntegrationWithWorkspacesMutation,
    SyncLinearIntegrationWithWorkspacesMutationVariables
  >(syncLinearIntegrationWithWorkspacesMutation, { awaitRefetchQueries: true });

  const possibleWorkspaces = useMemo(
    () => [authenticatedUser, ...authenticatedUser.memberOf],
    [authenticatedUser],
  );

  const [linearOrganizations, setLinearOrganizations] = useState<
    LinearOrganizationTeamsWithWorkspaces[]
  >(
    connectedLinearOrganizations.map(
      mapLinearOrganizationToLinearOrganizationTeamsWithWorkspaces({
        linearIntegrations,
      }),
    ),
  );

  const handleSave = useCallback(async () => {
    await Promise.all(
      linearIntegrations.map(({ entity }) => {
        const linearOrgId = entity.properties[
          extractBaseUrl(types.propertyType.linearOrgId.propertyTypeId)
        ] as string;

        const linearOrganization = linearOrganizations.find(
          ({ id }) => id === linearOrgId,
        )!;

        return syncLinearIntegrationWithWorkspaces({
          variables: {
            linearIntegrationEntityId: entity.metadata.recordId.entityId,
            syncWithWorkspaces:
              mapLinearOrganizationToSyncWithWorkspacesInputVariable({
                linearOrganization,
                possibleWorkspaces,
              }),
          },
        });
      }),
    );
  }, [
    syncLinearIntegrationWithWorkspaces,
    linearOrganizations,
    linearIntegrations,
    possibleWorkspaces,
  ]);

  return (
    <>
      <Typography variant="h5">Data Access</Typography>
      <Typography>
        Once connected to HASH, the contents of Linear Workspaces which are
        visible to you can be made available to one or more HASH workspaces you
        belong to. Access can also be granted on a per-Linear Team basis.
      </Typography>
      <SelectLinearTeamsTable
        linearOrganizations={linearOrganizations}
        setLinearOrganizations={setLinearOrganizations}
      />
      <Box display="flex" justifyContent="flex-end">
        <Button
          loading={loadingSyncLinearIntegrationWithWorkspaces}
          onClick={handleSave}
        >
          Save changes
        </Button>
      </Box>
    </>
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
            const linearOrgId = entity.properties[
              extractBaseUrl(types.propertyType.linearOrgId.propertyTypeId)
            ] as string;

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
    <Container>
      <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
        Linear
      </Typography>
      {connectedLinearOrganizations ? (
        <>
          <LinearConnections
            connectedLinearOrganizations={connectedLinearOrganizations}
          />
          {linearIntegrations ? (
            <DataAccess
              linearIntegrations={linearIntegrations}
              connectedLinearOrganizations={connectedLinearOrganizations}
            />
          ) : null}
        </>
      ) : null}
    </Container>
  );
};

LinearIntegrationsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default LinearIntegrationsPage;
