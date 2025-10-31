import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import { handleStyling, placeStyling } from "./styling";
import type { PlaceNodeData } from "./types";

export const PlaceNode = ({
  data,
  isConnectable,
}: NodeProps<PlaceNodeData>) => {
  return (
    <div
      className={css({
        position: "relative",
      })}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div className={placeStyling}>{data.label}</div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
