import CheckIcon from "@mui/icons-material/Check";
import { Tooltip } from "@mui/material";
import { FunctionComponent } from "react";

export const Check: FunctionComponent<{
  opacity?: number;
  onHoverDisplay?: string;
}> = ({ opacity, onHoverDisplay }) => {
  return onHoverDisplay ? (
    <Tooltip arrow placement="top" title={onHoverDisplay}>
      <CheckIcon style={{ color: "green", opacity }} />
    </Tooltip>
  ) : (
    <CheckIcon style={{ color: "green", opacity }} />
  );
};
