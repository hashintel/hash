import { Tooltip } from "@mui/material";

import { IconButton } from "@hashintel/design-system";

import { MagnifyingGlassRegularIcon } from "../../../../shared/icons/magnifying-glass-regular-icon";
import { iconPillSx } from "./pill-styles";

import type { FunctionComponent } from "react";

/**
 * The header's search toggle, dressed as a filter pill so it reads as part of
 * the ribbon's pill row (the same chrome as the web/type dropdowns beside it).
 */
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
