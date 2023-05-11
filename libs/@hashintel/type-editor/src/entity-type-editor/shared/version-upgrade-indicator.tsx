import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import {
  fluidFontClassName,
  FontAwesomeIcon,
  IconArrowRight,
  IconButton,
} from "@hashintel/design-system";
import {
  Stack,
  svgIconClasses,
  Tooltip,
  tooltipClasses,
  Typography,
} from "@mui/material";

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
    <IconButton
      onClick={(event) => {
        event.stopPropagation();
        onUpdateVersion();
      }}
      sx={{
        p: 0.5,
        minWidth: 0,
        minHeight: 0,
        fontSize: 11,
        fontWeight: 700,
        color: ({ palette }) => palette.blue[70],
        textTransform: "uppercase",
        gap: 0.625,
        lineHeight: "18px",
        ":hover": {
          color: ({ palette }) => palette.blue[70],

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
          fontSize: 11,
        }}
      />
      {mode === "tooltip" ? null : " Update"}
    </IconButton>
  );

  return (
    <Stack direction="row" gap={1} alignItems="center">
      {mode === "tooltip" ? (
        <Tooltip
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
