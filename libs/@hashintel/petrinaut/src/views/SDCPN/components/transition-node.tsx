import { css, cva } from "@hashintel/ds-helpers/css";
import { TbBolt, TbLambda } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { useSimulationStore } from "../../../state/simulation-provider";
import type { TransitionNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
});

const transitionBoxStyle = cva({
  base: {
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
    transition: "[all 0.2s ease]",
    _hover: {
      borderColor: "core.gray.70",
      boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
    },
  },
  variants: {
    selection: {
      resource: {
        boxShadow:
          "0 0 0 3px rgba(59, 178, 246, 0.4), 0 0 0 5px rgba(59, 190, 246, 0.2)",
      },
      reactflow: {
        boxShadow:
          "0 0 0 4px rgba(249, 115, 22, 0.4), 0 0 0 6px rgba(249, 115, 22, 0.2)",
      },
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
  },
});

const stochasticIconStyle = css({
  position: "absolute",
  top: "[8px]",
  left: "[0px]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "core.blue.60",
  fontSize: "[18px]",
});

const contentWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "spacing.2",
});

const labelStyle = css({
  textAlign: "center",
});

const firingIndicatorStyle = css({
  fontSize: "[16px]",
  color: "core.yellow.60",
  display: "flex",
  alignItems: "center",
});

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
  const selectionVariant = isSelectedByResource
    ? "resource"
    : selected
      ? "reactflow"
      : "none";

  return (
    <div className={containerStyle}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div className={transitionBoxStyle({ selection: selectionVariant })}>
        {data.lambdaType === "stochastic" && (
          <div className={stochasticIconStyle}>
            <TbLambda />
          </div>
        )}
        <div className={contentWrapperStyle}>
          <div className={labelStyle}>{label}</div>
          {justFired && (
            <div className={firingIndicatorStyle}>
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
