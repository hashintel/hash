import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import type { TransitionNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

export const TransitionNode: React.FC<NodeProps<TransitionNodeData>> = ({
  data,
  isConnectable,
  selected,
}: NodeProps<TransitionNodeData>) => {
  const { label } = data;

  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
      }}
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
          borderRadius: "radius.8",
          width: "[160px]",
          height: "[80px]",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: selected ? "core.blue.20" : "core.gray.20",
          border: "2px solid",
          borderColor: selected ? "core.blue.50" : "core.gray.50",
          fontSize: "[15px]",
          boxSizing: "border-box",
          position: "relative",
          _hover: {
            borderColor: selected ? "core.blue.60" : "core.gray.70",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
          },
        })}
        style={{ transition: "all 0.2s ease" }}
      >
        {label}
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
