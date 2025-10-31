import { css } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorContext } from "./editor-context";
import { handleStyling, transitionStyling } from "./styling";
import type { TransitionNodeData } from "./types";

// Icon SVG from design system
const IconDiagramRegular = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentColor"
    width="12"
    height="12"
  >
    <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" />
  </svg>
);

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  const { label, description, childNet } = data;

  const { loadPetriNet } = useEditorContext();

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
        {childNet && (
          <button
            type="button"
            title={`Switch to child net ${childNet.childNetTitle}`}
            onClick={(event) => {
              event.stopPropagation();
              loadPetriNet(childNet.childNetId);
            }}
            className={css({
              position: "absolute",
              top: "[0]",
              left: "[0]",
              background: "[transparent]",
              border: "none",
              cursor: "pointer",
              padding: "spacing.1",
              _hover: {
                "& svg": {
                  fill: "core.blue.70",
                },
              },
            })}
          >
            <IconDiagramRegular />
          </button>
        )}

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
