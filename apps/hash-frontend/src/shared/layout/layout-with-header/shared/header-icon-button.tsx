import { IconButton } from "@hashintel/design-system";
import { iconButtonClasses, styled, svgIconClasses } from "@mui/material";

export const HeaderIconButton = styled(IconButton)(({ theme }) => ({
  [`&.${iconButtonClasses.root}`]: {
    background: theme.palette.gray[15],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.palette.gray[20],
    transition: theme.transitions.create([
      "background",
      "border-color",
      "box-shadow",
    ]),
    [`> .${svgIconClasses.root}`]: {
      color: theme.palette.blue[100],
      transition: theme.transitions.create(["color"]),
    },
    "&:hover": {
      borderColor: theme.palette.blue[25],
      background: theme.palette.blue[20],
      [`> .${svgIconClasses.root}`]: {
        color: theme.palette.blue[60],
      },
    },
    "&:focus": {
      boxShadow: `0px 0px 0px 2px ${theme.palette.white}, 0px 0px 0px 3.5px ${theme.palette.blue[70]}`,
      [`> .${svgIconClasses.root}`]: {
        color: theme.palette.blue[70],
      },
    },
    "&:focus-visible:after": {
      borderWidth: 0,
    },
    "&:active": {
      background: theme.palette.blue[70],
      [`> .${svgIconClasses.root}`]: {
        color: theme.palette.white,
      },
    },
  },
}));
