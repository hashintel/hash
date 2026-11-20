import { Tooltip } from "@mui/material";

import { HashInlineIcon, IconButton } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";

import type { HashIconDefinition } from "@hashintel/design-system";

interface RowActionProps {
  icon: HashIconDefinition;
  onClick: () => void;
  tooltip: string;
}

export const RowAction = ({ icon, onClick, tooltip }: RowActionProps) => {
  return (
    <Tooltip
      title={tooltip}
      placement="top"
      PopperProps={{
        // this className prevents editor overlay from closing
        className: GRID_CLICK_IGNORE_CLASS,
      }}
      disableInteractive
    >
      <IconButton
        onClick={onClick}
        sx={{ background: "white !important", width: 50 }}
        size="small"
      >
        <HashInlineIcon icon={icon} />
      </IconButton>
    </Tooltip>
  );
};
