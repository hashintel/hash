import { styled } from "@mui/material";
import { IconButton } from "../../IconButton";

export const HeaderIconButton = styled(IconButton)<{ open: boolean }>(
  ({ theme, open }) => ({
    boxShadow: open
      ? `0px 0px 0px 2px ${theme.palette.common.white}, 0px 0px 0px 5px ${theme.palette.gray[40]}`
      : "unset",
    transition: theme.transitions.create(["box-shadow"]),
    ":hover": {
      boxShadow: `0px 0px 0px 2px ${theme.palette.common.white}, 0px 0px 0px 5px ${theme.palette.gray[40]}`,
    },
    "&:focus-within": {
      outline: "none",
      boxShadow: `0px 0px 0px 2px ${theme.palette.common.white}, 0px 0px 0px 5px ${theme.palette.blue[70]}`,
    },
  }),
);
