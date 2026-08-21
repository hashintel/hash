import { styled } from "@mui/material";

import { theme } from "@hashintel/design-system/theme";

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
