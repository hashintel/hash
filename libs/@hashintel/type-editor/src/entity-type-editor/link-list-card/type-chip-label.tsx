import { VersionedUrl } from "@blockprotocol/type-system";
import {
  faArrowUpRightFromSquare,
  faAsterisk,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, IconButton, Stack } from "@mui/material";
import { ReactNode } from "react";

import { useIsReadonly } from "../../shared/read-only-context";
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
          <IconButton
            sx={{
              padding: 0,
              background: "transparent !important",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              sx={({ palette }) => ({
                height: "11px",
                width: "11px",
                "&:hover": { fill: palette.primary.light },
              })}
            />
          </IconButton>
        </Link>
      )}
    </Stack>
  );
};
