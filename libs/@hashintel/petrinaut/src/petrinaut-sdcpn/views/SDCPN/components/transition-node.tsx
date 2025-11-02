import { Handle, type NodeProps, Position } from "reactflow";

import type { TransitionNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling, transitionStyling } from "../styles/styling";

export const TransitionNode: React.FC<NodeProps<TransitionNodeData>> = ({
  data,
  isConnectable,
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
      <div className={transitionStyling}>{label}</div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
