import {
  Box,
  Stack,
  TableBody,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { LinearLogo } from "../../../shared/icons/linear-logo";
import { SettingsTable } from "../shared/settings-table";
import { SettingsTableCell } from "../shared/settings-table-cell";
import { useLinearIntegrations } from "./linear/use-linear-integrations";
import { UserIntegrationContextMenu } from "./user-connected-integrations/integration-context-menu";

export const UserConnectedIntegrations = () => {
  const { linearIntegrations, connectedLinearOrganizations } =
    useLinearIntegrations();

  if (!linearIntegrations.length) {
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
          {linearIntegrations.map((integration) => {
            const linearOrg = connectedLinearOrganizations.find(
              (org) =>
                org.id ===
                integration.entity.properties[
                  "https://hash.ai/@h/types/property-type/linear-org-id/"
                ],
            );

            return (
              <TableRow key={integration.entity.entityId}>
                <SettingsTableCell>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <LinearLogo sx={{ fontSize: 16 }} /> Linear
                  </Stack>
                </SettingsTableCell>
                <SettingsTableCell>
                  <Stack direction="row" alignItems="center" gap={1}>
                    {linearOrg?.logoUrl && (
                      <Box
                        component="img"
                        src={linearOrg.logoUrl}
                        sx={{ height: 18, width: 18, borderRadius: 1 }}
                      />
                    )}
                    {linearOrg?.name}
                  </Stack>
                </SettingsTableCell>
                <SettingsTableCell>
                  {integration.syncedWithWebs
                    .map((web) => web.webName)
                    .join(", ")}
                </SettingsTableCell>
                <SettingsTableCell>
                  <UserIntegrationContextMenu integrationType="linear" />
                </SettingsTableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </SettingsTable>
    </Box>
  );
};
