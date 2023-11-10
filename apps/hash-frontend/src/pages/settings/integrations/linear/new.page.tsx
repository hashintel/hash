import { useLazyQuery, useMutation } from "@apollo/client";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { EntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  SyncLinearIntegrationWithWorkspacesMutation,
  SyncLinearIntegrationWithWorkspacesMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  getLinearOrganizationQuery,
  syncLinearIntegrationWithWorkspacesMutation,
} from "../../../../graphql/queries/integrations/linear.queries";
import { NextPageWithLayout } from "../../../../shared/layout";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../shared/settings-layout";
import {
  LinearOrganizationTeamsWithWorkspaces,
  mapLinearOrganizationToLinearOrganizationTeamsWithWorkspaces,
  mapLinearOrganizationToSyncWithWorkspacesInputVariable,
  SelectLinearTeamsTable,
} from "../select-linear-teams-table";
import { useLinearIntegrations } from "../use-linear-integrations";

const NewLinearIntegrationPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthenticatedUser();

  const [linearOrganization, setLinearOrganization] =
    useState<LinearOrganizationTeamsWithWorkspaces>();

  const [
    syncLinearIntegrationWithWorkspaces,
    { loading: loadingSyncLinearIntegrationWithWorkspaces },
  ] = useMutation<
    SyncLinearIntegrationWithWorkspacesMutation,
    SyncLinearIntegrationWithWorkspacesMutationVariables
  >(syncLinearIntegrationWithWorkspacesMutation);

  const [getLinearOrganization] = useLazyQuery<
    GetLinearOrganizationQuery,
    GetLinearOrganizationQueryVariables
  >(getLinearOrganizationQuery);

  const linearIntegrationEntityId = useMemo(() => {
    return router.query.linearIntegrationEntityId as EntityId | undefined;
  }, [router]);

  const { linearIntegrations } = useLinearIntegrations();

  useEffect(() => {
    void (async () => {
      if (!linearIntegrations || !linearIntegrationEntityId) {
        return;
      }

      const linearIntegration = linearIntegrations.find(
        ({ entity }) =>
          entity.metadata.recordId.entityId === linearIntegrationEntityId,
      );

      if (!linearIntegration) {
        void router.push("/account/integrations");
        return;
      }
      const linearOrgId = linearIntegration.entity.properties[
        extractBaseUrl(systemTypes.propertyType.linearOrgId.propertyTypeId)
      ] as string;

      const { data } = await getLinearOrganization({
        variables: { linearOrgId },
      });

      if (data) {
        const organization = data.getLinearOrganization;

        setLinearOrganization(
          mapLinearOrganizationToLinearOrganizationTeamsWithWorkspaces({
            linearIntegrations,
          })(organization),
        );
      } else {
        throw new Error("Could not get linear organization");
      }
    })();
  }, [
    linearIntegrations,
    linearIntegrationEntityId,
    router,
    getLinearOrganization,
  ]);

  const possibleWorkspaces = useMemo(
    () => [
      authenticatedUser,
      ...authenticatedUser.memberOf.map(({ org }) => org),
    ],
    [authenticatedUser],
  );

  const handleSaveAndContinue = useCallback(async () => {
    if (linearIntegrationEntityId && linearOrganization) {
      /** @todo: add proper error handling */

      await syncLinearIntegrationWithWorkspaces({
        variables: {
          linearIntegrationEntityId,
          syncWithWorkspaces:
            mapLinearOrganizationToSyncWithWorkspacesInputVariable({
              linearOrganization,
              possibleWorkspaces,
            }),
        },
      });

      void router.push("/account/integrations/linear");
    }
  }, [
    syncLinearIntegrationWithWorkspaces,
    linearIntegrationEntityId,
    linearOrganization,
    possibleWorkspaces,
    router,
  ]);

  return (
    <Container>
      <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
        Linear
      </Typography>
      <Typography>Connecting to Linear</Typography>
      {linearOrganization ? (
        <>
          <SelectLinearTeamsTable
            linearOrganizations={[linearOrganization]}
            setLinearOrganizations={(update) =>
              typeof update === "function"
                ? setLinearOrganization((prev) => update([prev!])[0])
                : setLinearOrganization(update[0])
            }
          />
          <Box display="flex" justifyContent="flex-end" columnGap={2}>
            <Button variant="tertiary">Exit without granting access</Button>
            <Button
              disabled={loadingSyncLinearIntegrationWithWorkspaces}
              onClick={handleSaveAndContinue}
            >
              Save and continue
            </Button>
          </Box>
        </>
      ) : null}
    </Container>
  );
};

NewLinearIntegrationPage.getLayout = (page) => getSettingsLayout(page);

export default NewLinearIntegrationPage;
