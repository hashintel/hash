import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import { handleStyling, transitionStyling } from "./styling";
import type { TransitionNodeData } from "./types";

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  const { label, description } = data;

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
      <div className={transitionStyling}>
        {label}

        {description && (
          <div
            className={css({
              fontSize: "[0.75rem]",
              color: "core.gray.70",
              mt: "spacing.2",
              textAlign: "center",
            })}
          >
            {description}
          </div>
        )}
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
