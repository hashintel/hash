import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbBolt, TbLambda } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { SimulationContext } from "../../../state/simulation-provider";
import type { TransitionNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
});

const transitionBoxStyle = cva({
  base: {
    padding: "4",
    borderRadius: "md.6",
    width: "[160px]",
    height: "[80px]",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "gray.20",
    border: "2px solid",
    borderColor: "gray.50",
    fontSize: "[15px]",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      borderColor: "gray.70",
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
    },
  },
  variants: {
    selection: {
      resource: {
        outline: "[4px solid rgba(59, 178, 246, 0.6)]",
        _hover: {
          outline: "[4px solid rgba(59, 178, 246, 0.7)]",
        },
      },
      reactflow: {
        outline: "[4px solid rgba(40, 172, 233, 0.6)]",
      },
      none: {},
    },
    fired: {
      true: {
        background: "yellow.20/70",
        boxShadow: "0 0 6px 1px rgba(255, 132, 0, 0.59)",
        transition: "[background 0s, box-shadow 0s, outline 0.3s]",
      },
      false: {
        transition: "[background 0.3s, box-shadow 0.3s, outline 0.3s]",
      },
    },
  },
  defaultVariants: {
    selection: "none",
    fired: false,
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
  color: "blue.60",
  fontSize: "[18px]",
});

const contentWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "3",
});

const labelStyle = css({
  textAlign: "center",
});

const firingIndicatorStyle = cva({
  base: {
    position: "absolute",
    bottom: "[8px]",
    left: "[0px]",
    width: "[100%]",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "[20px]",
    color: "yellow.60",
  },
  variants: {
    fired: {
      true: {
        opacity: "[1]",
        transform: "scale(1)",
        transition: "[opacity 0s, transform 0s]",
      },
      false: {
        opacity: "[0]",
        transform: "scale(0.5)",
        transition:
          "[opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0,-1.41,.17,.9)]",
      },
    },
  },
  defaultVariants: {
    fired: false,
  },
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
  const { simulation, currentlyViewedFrame } = use(SimulationContext);

  // Check if this transition just fired (time since last fire is zero)
  let justFired = false;
  if (simulation && simulation.frames.length > 0) {
    const frame = simulation.frames[currentlyViewedFrame];
    const transitionData = frame?.transitions.get(id);
    // Ugly hack: check if currentlyViewedFrame is greater than 0 to avoid showing the transition as fired on the first frame.
    // This will be fixed when define proper simulation state interface.
    if (transitionData && currentlyViewedFrame > 0) {
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
      <div
        className={transitionBoxStyle({
          selection: selectionVariant,
          fired: justFired,
        })}
      >
        {data.lambdaType === "stochastic" && (
          <div className={stochasticIconStyle}>
            <TbLambda />
          </div>
        )}
        <div className={contentWrapperStyle}>
          <div className={labelStyle}>{label}</div>
        </div>
        <div className={firingIndicatorStyle({ fired: justFired })}>
          <TbBolt />
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
