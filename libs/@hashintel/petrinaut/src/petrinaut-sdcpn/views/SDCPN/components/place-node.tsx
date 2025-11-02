import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import type { PlaceNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

export const PlaceNode: React.FC<NodeProps<PlaceNodeData>> = ({
  data,
  isConnectable,
  selected,
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
      <div
        className={css({
          padding: "spacing.4",
          borderRadius: "[50%]",
          width: "[130px]",
          height: "[130px]",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: selected ? "core.blue.10" : "core.gray.10",
          border: "2px solid",
          borderColor: selected ? "core.blue.50" : "core.gray.50",
          fontSize: "[15px]",
          boxSizing: "border-box",
          position: "relative",
          textAlign: "center",
          lineHeight: "[1.3]",
          _hover: {
            borderColor: selected ? "core.blue.60" : "core.gray.70",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
          },
        })}
        style={{ transition: "all 0.2s ease" }}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
