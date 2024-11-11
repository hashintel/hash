import { buttonClasses, styled } from "@mui/material";

import { Button } from "../../shared/ui/button";

export const CreateButton = styled(Button)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 14,
  padding: 0,
  transition: theme.transitions.create("color"),
  ":hover": {
    background: "transparent",
    color: theme.palette.blue[70],
    [`.${buttonClasses.endIcon}`]: {
      color: theme.palette.blue[70],
    },
  },
  [`.${buttonClasses.endIcon}`]: {
    color: theme.palette.blue[70],
  },
}));
