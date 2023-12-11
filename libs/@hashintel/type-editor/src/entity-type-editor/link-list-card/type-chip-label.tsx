import { VersionedUrl } from "@blockprotocol/type-system";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  ArrowUpRightRegularIcon,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { ReactNode } from "react";

import { useIsReadonly } from "../../shared/read-only-context";
import { ChipIconButton } from "../shared/chip-icon-button";
import { Link } from "../shared/link";
import { VersionUpgradeIndicator } from "../shared/version-upgrade-indicator";

export const TypeChipLabel = ({
  children,
  currentVersion,
  latestVersion,
  onUpdate,
  versionedUrl,
}: {
  children: ReactNode;
  currentVersion?: number;
  latestVersion?: number;
  versionedUrl?: VersionedUrl;
  onUpdate?: () => void;
}) => {
  const readonly = useIsReadonly();

  return (
    <Stack direction="row" spacing={0.75} fontSize={14} alignItems="center">
      <FontAwesomeIcon icon={faAsterisk} sx={{ fontSize: "inherit" }} />
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
