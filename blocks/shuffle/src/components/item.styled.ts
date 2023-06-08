import {
  Box,
  IconButton,
  inputBaseClasses,
  ListItem,
  Paper,
  styled,
  TextField,
} from "@mui/material";

const LINK_ICON_WIDTH = "2rem";

export const SListItem = styled(ListItem)(({ theme }) =>
  theme.unstable_sx({
    marginBottom: 2,
    outlineColor: theme.palette.primary.light,
  }),
);

export const SPaper = styled(Paper)(({ theme }) =>
  theme.unstable_sx({
    display: "flex",
    width: 1,
    paddingX: 2,
    paddingY: 1,
    background: theme.palette.grey[50],
    pl: 0,
    alignItems: "center",
  }),
);

export const SLinkIconWrapper = styled(Box)(({ theme }) =>
  theme.unstable_sx({
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: LINK_ICON_WIDTH,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }),
);

export const STextField = styled(TextField)(({ theme }) =>
  theme.unstable_sx({
    ml: LINK_ICON_WIDTH,
    border: "none",
    outline: "none",

    [`.${inputBaseClasses.disabled}`]: {
      color: "inherit !important",
      opacity: "1 !important",
      "-webkit-text-fill-color": "inherit !important",
    },
  }),
);

export const SButtonsWrapper = styled(Box)(({ theme }) =>
  theme.unstable_sx({ display: "flex", alignItems: "center", gap: 1 }),
);

export const SIconButton = styled(IconButton)(({ theme }) =>
  theme.unstable_sx({
    paddingX: 0.5,
    paddingY: 1,
    borderRadius: 1,
    maxHeight: 40,
  }),
);
