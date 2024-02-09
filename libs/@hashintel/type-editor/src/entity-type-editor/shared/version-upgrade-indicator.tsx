import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconArrowRight } from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";
import { Stack, svgIconClasses, Tooltip, Typography } from "@mui/material";

import { ChipIconButton } from "./chip-icon-button";

type VersionUpgradeIndicatorProps = {
  currentVersion: number;
  latestVersion: number;
  onUpdateVersion: () => void;
  mode?: "tooltip" | "inline";
};

export const VersionUpgradeIndicator = ({
  currentVersion,
  latestVersion,
  onUpdateVersion,
  mode = "inline",
}: VersionUpgradeIndicatorProps) => {
  const updateButton = (
    <ChipIconButton
      onClick={(event) => {
        event.stopPropagation();
        onUpdateVersion();
      }}
      sx={{
        minWidth: 0,
        minHeight: 0,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        gap: 0.625,
        lineHeight: "18px",
        ":hover": {
          background: mode === "tooltip" ? undefined : "transparent",
          [`.${svgIconClasses.root}`]: {
            transform: "rotate(360deg)",
            transition: ({ transitions }) => transitions.create("transform"),
          },
        },
      }}
    >
      <FontAwesomeIcon
        icon={faArrowsRotate}
        sx={{
          height: 12,
          width: 12,
        }}
      />
      {mode === "tooltip" ? null : " Update"}
    </ChipIconButton>
  );

  return (
    <Stack direction="row" gap={1} alignItems="center">
      {mode === "tooltip" ? (
        <Tooltip
          disableInteractive
          classes={{ popper: fluidFontClassName }}
          title={
            <Stack direction="row" gap={1} alignItems="center">
              <Typography variant="smallTextLabels" fontWeight={500}>
                Update v{currentVersion}
              </Typography>
              <IconArrowRight
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 14,
                }}
              />
              <Typography variant="smallTextLabels" fontWeight={500}>
                v{latestVersion}
              </Typography>
            </Stack>
          }
          placement="top"
        >
          {updateButton}
        </Tooltip>
      ) : (
        <>
          <Typography
            variant="smallTextLabels"
            color="gray.50"
            fontWeight={500}
          >
            v{currentVersion}
          </Typography>
          <IconArrowRight
            sx={{ color: ({ palette }) => palette.gray[50], fontSize: 14 }}
          />
          <Typography
            variant="smallTextLabels"
            color="blue.70"
            fontWeight={500}
          >
            v{latestVersion}
          </Typography>
          {updateButton}
        </>
      )}
    </Stack>
  );
};
