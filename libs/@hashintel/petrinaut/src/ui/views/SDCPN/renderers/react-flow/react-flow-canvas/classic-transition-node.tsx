import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useTransitionFrame } from "../../../canvas-frame-store";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { nodeFocusStyle } from "../../../styles/focus";
import { handleStyling } from "../../../styles/styling";
import { useTransitionFiringAnimation } from "./use-transition-firing-animation";

import type { TransitionNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
  height: "full",
});

const transitionBoxStyle = css({
  padding: "2",
  borderRadius: "xl",
  width: "full",
  height: "full",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  background: "neutral.s10",
  border: "2px solid",
  borderColor: "neutral.s80",
  fontSize: "[15px]",
  boxSizing: "border-box",
  position: "relative",
  cursor: "default",
  _hover: {
    borderColor: "[color-mix(in oklab, var(--colors-neutral-s80), black 15%)]",
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
  color: "blue.s60",
  fontSize: "lg",
});

const labelStyle = css({
  textAlign: "center",
  maxWidth: "[100%]",
  textOverflow: "ellipsis",
  overflow: "hidden",
  lineClamp: "2",
  lineHeight: "[1.25]",
});

const firingIndicatorStyle = css({
  position: "absolute",
  bottom: "[8px]",
  left: "[0px]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "xl",
  color: "yellow.s60",
  opacity: "[0]",
  transform: "scale(0.5)",
});

export const ClassicTransitionNode: React.FC<NodeProps<TransitionNodeType>> = ({
  id,
  data,
  isConnectable,
  positionAbsoluteX,
  positionAbsoluteY,
  selected,
}: NodeProps<TransitionNodeType>) => {
  const { label } = data;

  // Refs for animated elements
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boltRef = useRef<HTMLDivElement | null>(null);

  // Track firing count delta for simulation visualization
  const frame = useTransitionFrame(id);
  const firingDelta = useFiringDelta(frame?.firingCount ?? null);

  // Animate when firing occurs
  useTransitionFiringAnimation(boxRef, boltRef, firingDelta, {
    x: positionAbsoluteX,
    y: positionAbsoluteY,
  });

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  return (
    <div className={containerStyle}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div
        ref={boxRef}
        className={`${transitionBoxStyle} ${nodeFocusStyle({ focus })}`}
      >
        {data.lambdaType === "stochastic" && (
          <div className={stochasticIconStyle}>
            <Icon name="lambda" size="sm" />
          </div>
        )}
        <div className={labelStyle}>{label}</div>
        <div ref={boltRef} className={firingIndicatorStyle}>
          <Icon name="lightning" size="sm" />
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
