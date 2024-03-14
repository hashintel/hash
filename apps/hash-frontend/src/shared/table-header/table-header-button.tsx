import { buttonClasses, styled } from "@mui/material";

import type { ButtonProps } from "../ui";
import { Button } from "../ui";

export const TableHeaderButton = styled((props: ButtonProps) => (
  <Button variant="tertiary_quiet" {...props} />
))(({ theme }) => ({
  padding: theme.spacing(0.25, 2),
  borderRadius: 15,
  background: "transparent",
  minHeight: "unset",
  minWidth: "unset",
  fontWeight: 500,
  fontSize: 13,
  color: theme.palette.gray[70],
  [`.${buttonClasses.startIcon}`]: {
    color: theme.palette.gray[70],
  },
  ":hover": {
    color: theme.palette.gray[90],
    background: theme.palette.gray[30],
    [`.${buttonClasses.startIcon}`]: {
      color: theme.palette.gray[90],
    },
  },
}));
