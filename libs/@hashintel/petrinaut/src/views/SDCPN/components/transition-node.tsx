import { css } from "@hashintel/ds-helpers/css";
import { TbBolt, TbLambda } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { useSimulationStore } from "../../../state/simulation-provider";
import type { TransitionNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

export const TransitionNode: React.FC<NodeProps<TransitionNodeData>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<TransitionNodeData>) => {
  const { label } = data;

  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const simulation = useSimulationStore((state) => state.simulation);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  // Check if this transition just fired (time since last fire is zero)
  let justFired = false;
  if (simulation && simulation.frames.length > 0) {
    const frame = simulation.frames[currentlyViewedFrame];
    const transitionData = frame?.transitions.get(id);
    if (transitionData) {
      justFired = transitionData.timeSinceLastFiring === 0;
    }
  }

  // Determine selection state
  const isSelectedByResource = selectedResourceId === id;

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
          background: "core.gray.20",
          border: "2px solid",
          borderColor: "core.gray.50",
          fontSize: "[15px]",
          boxSizing: "border-box",
          position: "relative",
          cursor: "default",
          _hover: {
            borderColor: "core.gray.70",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
          },
        })}
        style={{
          transition: "all 0.2s ease",
          // Selection indicator:
          // - Blue glow for selectedResourceId (properties panel selection)
          // - Orange glow for ReactFlow selection (when not selected by resource)
          boxShadow: isSelectedByResource
            ? "0 0 0 3px rgba(59, 178, 246, 0.4), 0 0 0 5px rgba(59, 190, 246, 0.2)"
            : selected
              ? "0 0 0 4px rgba(249, 115, 22, 0.4), 0 0 0 6px rgba(249, 115, 22, 0.2)"
              : undefined,
        }}
      >
        {data.lambdaType === "stochastic" && (
          <div
            className={css({
              position: "absolute",
              top: "[8px]",
              left: "[0px]",
              width: "[100%]",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "core.blue.60",
              fontSize: "[18px]",
            })}
          >
            <TbLambda />
          </div>
        )}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "spacing.2",
          })}
        >
          <div
            className={css({
              textAlign: "center",
            })}
          >
            {label}
          </div>
          {justFired && (
            <div
              className={css({
                fontSize: "[16px]",
                color: "core.yellow.60",
                display: "flex",
                alignItems: "center",
              })}
            >
              <TbBolt />
            </div>
          )}
        </div>
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
