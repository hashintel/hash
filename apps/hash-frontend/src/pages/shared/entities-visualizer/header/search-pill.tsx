import { Tooltip } from "@mui/material";

import { IconButton } from "@hashintel/design-system";

import { MagnifyingGlassRegularIcon } from "../../../../shared/icons/magnifying-glass-regular-icon";
import { iconPillSx } from "./pill-styles";

import type { FunctionComponent } from "react";

export const SearchPill: FunctionComponent<{
  title: string;
  onClick: () => void;
}> = ({ title, onClick }) => (
  <Tooltip title={title} placement="top">
    <IconButton onClick={onClick} sx={iconPillSx}>
      <MagnifyingGlassRegularIcon />
    </IconButton>
  </Tooltip>
);
