import {
  Box,
  IconButton,
  ListItem,
  Paper,
  styled,
  experimental_sx as sx,
} from "@mui/material";

export const SListItem = styled(ListItem)(({ theme }) =>
  sx({
    marginBottom: 2,
    outlineColor: theme.palette.primary.light,
  }),
);

export const SPaper = styled(Paper)(({ theme }) =>
  sx({
    display: "flex",
    width: 1,
    paddingX: 2,
    paddingY: 1,
    background: theme.palette.grey[50],
    pl: 0,
    alignItems: "center",
  }),
);

export const SLinkIconWrapper = styled(Box)(
  sx({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    m: "0 0.25rem",
  }),
);

export const SButtonsWrapper = styled(Box)(
  sx({ display: "flex", alignItems: "center", gap: 1 }),
);

export const SIconButton = styled(IconButton)(
  sx({
    paddingX: 0.5,
    paddingY: 1,
    borderRadius: 1,
    maxHeight: 40,
  }),
);
