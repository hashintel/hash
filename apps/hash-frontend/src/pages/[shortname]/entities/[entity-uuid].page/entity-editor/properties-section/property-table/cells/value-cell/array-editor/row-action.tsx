import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  GRID_CLICK_IGNORE_CLASS,
  IconButton,
} from "@hashintel/design-system";
import { Tooltip } from "@mui/material";

interface RowActionProps {
  icon: IconDefinition;
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
        <FontAwesomeIcon icon={icon} />
      </IconButton>
    </Tooltip>
  );
};
