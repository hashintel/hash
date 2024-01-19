import { Chip } from "@hashintel/design-system";
import { chipClasses, styled } from "@mui/material";

export const DraftEntityChip = styled(Chip)(({ theme, clickable }) => ({
  color: theme.palette.common.black,
  background: theme.palette.common.white,
  borderColor: theme.palette.gray[30],
  fontWeight: 500,
  fontSize: 12,
  textTransform: "none",
  ...(clickable
    ? {
        "&:hover": {
          background: theme.palette.gray["10"],
        },
      }
    : {}),
  [`& .${chipClasses.icon}`]: {
    marginLeft: theme.spacing(1.25),
    color: theme.palette.gray[50],
  },
  [`& .${chipClasses.label}`]: {
    padding: theme.spacing(0.5, 1.25),
  },
}));
