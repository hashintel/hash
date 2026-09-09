import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useFiringAnimation } from "../../../hooks/use-firing-animation";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { useSelectionVariant } from "../../../hooks/use-selection-variant";
import {
  nodeSurfaceStyle,
  transitionSurfaceStyle,
} from "../../../styles/node-surface";
import { handleStyling } from "../../../styles/styling";

import type { TransitionNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
  height: "full",
});

const transitionBoxStyle = css({
  padding: "2",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "[15px]",
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
  selected,
}: NodeProps<TransitionNodeType>) => {
  const { label } = data;

  // Refs for animated elements
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boltRef = useRef<HTMLDivElement | null>(null);

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data.frame?.firingCount ?? null);

  // Animate when firing occurs
  useFiringAnimation(boxRef, boltRef, firingDelta);

  const selectionVariant = useSelectionVariant(id, selected);

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
        className={`${nodeSurfaceStyle({ selection: selectionVariant })} ${transitionSurfaceStyle} ${transitionBoxStyle}`}
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
