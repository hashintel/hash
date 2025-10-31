import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import { handleStyling, nodeDimensions, placeStyling } from "./styling";
import type { PlaceNodeData } from "./types";

// Icon SVG from design system
const IconDiagramRegular = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentColor"
    width="16"
    height="16"
  >
    <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" />
  </svg>
);

export const PlaceNode = ({
  data,
  isConnectable,
}: NodeProps<PlaceNodeData>) => {
  const { parentNetNode } = data;

  return (
    <div
      className={css({
        position: "relative",
      })}
    >
      {parentNetNode && (
        <div title="Place from parent net">
          <IconDiagramRegular
            className={css({
              fill: "core.gray.60",
              position: "absolute",
              top: "[10px]",
              left: `[${nodeDimensions.place.width / 2 - 8}px]`,
              fontSize: "[16px]",
              zIndex: "[3]",
            })}
          />
        </div>
      )}
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
