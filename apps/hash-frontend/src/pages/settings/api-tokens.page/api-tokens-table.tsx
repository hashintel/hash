import {
  Box,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { format, formatDistanceToNowStrict } from "date-fns";

import { IconButton } from "@hashintel/design-system";

import { TrashRegularIcon } from "../../../shared/icons/trash-regular-icon";
import { SettingsTable } from "../shared/settings-table";
import { SettingsTableCell } from "../shared/settings-table-cell";

import type {
  ApiTokenResponse,
  ApiTokenStatus,
} from "@local/hash-graph-sdk/api-token";
import type { Palette } from "@mui/material";
import type { FunctionComponent } from "react";

const statusConfig: Record<
  ApiTokenStatus,
  { label: string; getColor: (palette: Palette) => string }
> = {
  active: { label: "Active", getColor: (palette) => palette.green[70] },
  expired: { label: "Expired", getColor: (palette) => palette.orange[60] },
  revoked: { label: "Revoked", getColor: (palette) => palette.gray[50] },
};

const formatDate = (timestamp: string) =>
  format(new Date(timestamp), "MMM d, yyyy");

const ApiTokenRow: FunctionComponent<{
  apiToken: ApiTokenResponse;
  onRevoke: (apiToken: ApiTokenResponse) => void;
}> = ({ apiToken, onRevoke }) => {
  const { label, getColor } = statusConfig[apiToken.status];

  return (
    <TableRow>
      <SettingsTableCell
        sx={{
          "& > .MuiTypography-root": {
            display: "-webkit-box",
            overflow: "hidden",
            overflowWrap: "anywhere",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          },
        }}
      >
        {apiToken.name}
      </SettingsTableCell>
      <TableCell>
        <Typography
          component="code"
          variant="smallTextParagraphs"
          sx={({ palette }) => ({
            color: palette.gray[70],
            fontFamily: "monospace",
          })}
        >
          {apiToken.hint}
        </Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" alignItems="center" gap={1}>
          <Box
            sx={({ palette }) => ({
              background: getColor(palette),
              borderRadius: "50%",
              height: 8,
              width: 8,
            })}
          />
          <Typography variant="smallTextParagraphs">{label}</Typography>
        </Stack>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Typography variant="smallTextParagraphs">
          {formatDate(apiToken.createdAt)}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Typography variant="smallTextParagraphs">
          {apiToken.expiresAt ? formatDate(apiToken.expiresAt) : "Never"}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Typography variant="smallTextParagraphs">
          {apiToken.lastUsedAt
            ? formatDistanceToNowStrict(new Date(apiToken.lastUsedAt), {
                addSuffix: true,
              })
            : "Never"}
        </Typography>
      </TableCell>
      <TableCell align="right">
        {apiToken.status === "active" ? (
          <Tooltip title="Revoke token">
            <IconButton
              aria-label={`Revoke the token "${apiToken.name}"`}
              onClick={() => onRevoke(apiToken)}
              sx={({ palette }) => ({
                svg: { fontSize: 14, fill: palette.red[60] },
                "&:hover": {
                  background: palette.red[10],
                  svg: { fill: palette.red[70] },
                },
              })}
            >
              <TrashRegularIcon />
            </IconButton>
          </Tooltip>
        ) : null}
      </TableCell>
    </TableRow>
  );
};

export const ApiTokensTable: FunctionComponent<{
  apiTokens: ApiTokenResponse[];
  onRevoke: (apiToken: ApiTokenResponse) => void;
}> = ({ apiTokens, onRevoke }) => (
  <SettingsTable sx={{ background: ({ palette }) => palette.common.white }}>
    <TableHead>
      <TableRow>
        <SettingsTableCell>Name</SettingsTableCell>
        <SettingsTableCell>Token</SettingsTableCell>
        <SettingsTableCell>Status</SettingsTableCell>
        <SettingsTableCell sx={{ whiteSpace: "nowrap" }}>
          Created
        </SettingsTableCell>
        <SettingsTableCell sx={{ whiteSpace: "nowrap" }}>
          Expires
        </SettingsTableCell>
        <SettingsTableCell sx={{ whiteSpace: "nowrap" }}>
          Last used
        </SettingsTableCell>
        <SettingsTableCell />
      </TableRow>
    </TableHead>
    <TableBody>
      {apiTokens.map((apiToken) => (
        <ApiTokenRow
          key={apiToken.tokenId}
          apiToken={apiToken}
          onRevoke={onRevoke}
        />
      ))}
    </TableBody>
  </SettingsTable>
);
