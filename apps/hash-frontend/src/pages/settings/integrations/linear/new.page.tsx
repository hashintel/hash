import { useLazyQuery, useMutation } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GetLinearOrganizationQuery,
  GetLinearOrganizationQueryVariables,
  SyncLinearIntegrationWithWebsMutation,
  SyncLinearIntegrationWithWebsMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  getLinearOrganizationQuery,
  syncLinearIntegrationWithWebsMutation,
} from "../../../../graphql/queries/integrations/linear.queries";
import type { NextPageWithLayout } from "../../../../shared/layout";
import { Button } from "../../../../shared/ui";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { getSettingsLayout } from "../../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import { LinearHeader } from "./linear-header";
import type { LinearOrganizationTeamsWithWebs } from "./select-linear-teams-table";
import {
  mapLinearOrganizationToLinearOrganizationTeamsWithWebs,
  mapLinearOrganizationToSyncWithWebsInputVariable,
  SelectLinearTeamsTable,
} from "./select-linear-teams-table";
import { useLinearIntegrations } from "./use-linear-integrations";

const NewLinearIntegrationPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthenticatedUser();

  const [linearOrganization, setLinearOrganization] =
    useState<LinearOrganizationTeamsWithWebs>();

  const [
    syncLinearIntegrationWithWebs,
    { loading: loadingSyncLinearIntegrationWithWorkspaces },
  ] = useMutation<
    SyncLinearIntegrationWithWebsMutation,
    SyncLinearIntegrationWithWebsMutationVariables
  >(syncLinearIntegrationWithWebsMutation);

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
      if (linearIntegrations.length === 0 || !linearIntegrationEntityId) {
        return;
      }

      const linearIntegration = linearIntegrations.find(
        ({ entity }) =>
          entity.metadata.recordId.entityId === linearIntegrationEntityId,
      );

      if (!linearIntegration) {
        void router.push("/settings/integrations");
        return;
      }

      const { linearOrgId } = simplifyProperties(
        linearIntegration.entity.properties,
      );

      const { data } = await getLinearOrganization({
        variables: { linearOrgId },
      });

      if (data) {
        const organization = data.getLinearOrganization;

        setLinearOrganization(
          mapLinearOrganizationToLinearOrganizationTeamsWithWebs({
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

      await syncLinearIntegrationWithWebs({
        variables: {
          linearIntegrationEntityId,
          syncWithWebs: mapLinearOrganizationToSyncWithWebsInputVariable({
            linearOrganization,
            possibleWebs: possibleWorkspaces,
          }),
        },
      });

      void router.push("/settings/integrations");
    }
  }, [
    syncLinearIntegrationWithWebs,
    linearIntegrationEntityId,
    linearOrganization,
    possibleWorkspaces,
    router,
  ]);

  return (
    <SettingsPageContainer
      heading={<LinearHeader />}
      sectionLabel="Set up connection"
    >
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
          <Box
            display="flex"
            justifyContent="flex-end"
            columnGap={2}
            py={2}
            px={3}
          >
            <Button variant="tertiary" size="small">
              Exit without granting access
            </Button>
            <Button
              disabled={loadingSyncLinearIntegrationWithWorkspaces}
              onClick={handleSaveAndContinue}
              size="small"
            >
              Save and continue
            </Button>
          </Box>
        </>
      ) : (
        <Box p={2}>
          <Typography variant="smallTextParagraphs">
            Connecting to Linear...
          </Typography>
        </Box>
      )}
    </SettingsPageContainer>
  );
};

NewLinearIntegrationPage.getLayout = (page) => getSettingsLayout(page);

export default NewLinearIntegrationPage;
