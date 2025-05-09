import type {
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightRegularIcon,
  EntityOrTypeIcon,
} from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { useIsReadonly } from "../../shared/read-only-context";
import { ChipIconButton } from "../shared/chip-icon-button";
import { Link } from "../shared/link";
import { VersionUpgradeIndicator } from "../shared/version-upgrade-indicator";

export const TypeChipLabel = ({
  children,
  currentVersion,
  icon,
  latestVersion,
  onUpdate,
  versionedUrl,
}: {
  children: ReactNode;
  currentVersion?: OntologyTypeVersion;
  icon?: string;
  latestVersion?: OntologyTypeVersion;
  versionedUrl?: VersionedUrl;
  onUpdate?: () => void;
}) => {
  const readonly = useIsReadonly();

  return (
    <Stack direction="row" spacing={0.75} fontSize={14} alignItems="center">
      <EntityOrTypeIcon
        entity={null}
        fontSize={14}
        icon={icon}
        isLink
        fill={({ palette }) => palette.blue[70]}
      />
      <Box component="span">{children}</Box>

      {!readonly &&
      currentVersion &&
      latestVersion &&
      onUpdate &&
      currentVersion !== latestVersion ? (
        <Box sx={{ my: ({ spacing }) => `-${spacing(0.5)} !important` }}>
          <VersionUpgradeIndicator
            currentVersion={currentVersion}
            latestVersion={latestVersion}
            onUpdateVersion={onUpdate}
            mode="tooltip"
          />
        </Box>
      ) : null}

      {versionedUrl && (
        <Link href={versionedUrl}>
          <Tooltip
            disableInteractive
            title={
              <Typography variant="smallTextLabels" fontWeight={500}>
                Inspect this type
              </Typography>
            }
            placement="top"
          >
            <ChipIconButton>
              <ArrowUpRightRegularIcon
                sx={{
                  width: 14,
                  height: 14,
                }}
              />
            </ChipIconButton>
          </Tooltip>
        </Link>
      )}
    </Stack>
  );
};
