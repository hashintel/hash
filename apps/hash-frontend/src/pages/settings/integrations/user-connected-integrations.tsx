import {
  Box,
  Stack,
  TableBody,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { IntegrationIconTile } from "../integrations.page/integration-icon-tile";
import { SettingsTable } from "../shared/settings-table";
import { SettingsTableCell } from "../shared/settings-table-cell";
import { UserIntegrationContextMenu } from "./user-connected-integrations/integration-context-menu";

import type { EntityId } from "@blockprotocol/type-system";

export type UserConnectedIntegration = {
  entityId: EntityId;
  /** The integration's name in the integrations catalog. */
  integrationName: string;
  /** The path segment of the integration's page under `/settings/integrations`. */
  integrationSlug: string;
  sourceResource: { name: string; logoUrl?: string | null };
  syncedWebNames: string[];
};

export const UserConnectedIntegrations = ({
  integrations,
}: {
  integrations: UserConnectedIntegration[];
}) => {
  if (!integrations.length) {
    return null;
  }

  return (
    <Box>
      <Typography variant="mediumCaps" mb={2} component="div">
        Existing integrations
      </Typography>
      <SettingsTable sx={{ background: ({ palette }) => palette.common.white }}>
        <TableHead>
          <TableRow>
            <SettingsTableCell>Source</SettingsTableCell>
            <SettingsTableCell>Source Resource(s)</SettingsTableCell>
            <SettingsTableCell>Synced to HASH web(s)</SettingsTableCell>
            <SettingsTableCell sx={{ width: 50 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {integrations.map((integration) => (
            <TableRow key={integration.entityId}>
              <SettingsTableCell>
                <Stack direction="row" alignItems="center" gap={1}>
                  <IntegrationIconTile
                    name={integration.integrationName}
                    tileSize={16}
                  />{" "}
                  {integration.integrationName}
                </Stack>
              </SettingsTableCell>
              <SettingsTableCell>
                <Stack direction="row" alignItems="center" gap={1}>
                  {integration.sourceResource.logoUrl && (
                    <Box
                      component="img"
                      src={integration.sourceResource.logoUrl}
                      sx={{ height: 18, width: 18, borderRadius: 1 }}
                    />
                  )}
                  {integration.sourceResource.name}
                </Stack>
              </SettingsTableCell>
              <SettingsTableCell>
                {integration.syncedWebNames.join(", ")}
              </SettingsTableCell>
              <SettingsTableCell>
                <UserIntegrationContextMenu
                  integrationSlug={integration.integrationSlug}
                />
              </SettingsTableCell>
            </TableRow>
          ))}
        </TableBody>
      </SettingsTable>
    </Box>
  );
};
