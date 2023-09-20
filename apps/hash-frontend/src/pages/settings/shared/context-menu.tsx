import { theme } from "@hashintel/design-system/theme";
import {
  listItemSecondaryActionClasses,
  MenuProps,
  styled,
} from "@mui/material";

export const ContextButton = styled("button")`
  background: none;
  border: none;
  border-radius: 8px;
  color: ${theme.palette.gray["60"]};
  font-size: 22px;
  cursor: pointer;
  padding: 0 12px 8px 12px;
  user-select: none;

  &:hover {
    background: ${theme.palette.gray["10"]};
  }
`;

export const contextMenuProps: Partial<MenuProps> = {
  anchorOrigin: {
    vertical: "bottom",
    horizontal: "left",
  },
  transformOrigin: {
    vertical: "top",
    horizontal: "left",
  },
  PaperProps: {
    elevation: 4,
    sx: {
      borderRadius: "6px",
      marginTop: 1,
      border: `1px solid ${theme.palette.gray["20"]}`,

      [`.${listItemSecondaryActionClasses.root}`]: {
        display: { xs: "none", md: "block" },
      },
    },
  },
};
