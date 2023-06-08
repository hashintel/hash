import { IconButton } from "@hashintel/design-system";
import { styled } from "@mui/material";

export const HeaderIconButton = styled(IconButton)(({ theme }) => ({
  transition: theme.transitions.create(["box-shadow"]),
  ":hover": {
    color: theme.palette.gray[50],
    boxShadow: `0px 0px 0px 2px ${theme.palette.common.white}, 0px 0px 0px 5px ${theme.palette.gray[40]}`,
  },
}));
