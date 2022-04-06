import { styled } from "@mui/material";
import { IconButton } from "../../../ui";

const focusBorderOffset = 6;
const focusBorderWidth = 3;

export const HeaderIconButton = styled(IconButton)<{ open: boolean }>(
  ({ theme }) => ({
    transition: theme.transitions.create(["box-shadow"]),
    ":hover": {
      boxShadow: `0px 0px 0px 2px ${theme.palette.common.white}, 0px 0px 0px 5px ${theme.palette.gray[40]}`,
    },
    "&:focus-visible:after": {
      top: -focusBorderOffset,
      left: -focusBorderOffset,
      right: -focusBorderOffset,
      bottom: -focusBorderOffset,
      borderWidth: focusBorderWidth,
      borderRadius: "50%",
    },
  }),
);
