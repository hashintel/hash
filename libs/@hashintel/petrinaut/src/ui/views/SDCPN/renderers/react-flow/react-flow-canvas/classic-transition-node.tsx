import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { useTransitionFrame } from "../../../canvas-frame-store";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import {
  classicNodeBoxStyle,
  classicNodeLabelStyle,
} from "../../../styles/classic-node-layout";
import { nodeFocusStyle } from "../../../styles/focus";
import {
  nodeSurfaceStyle,
  transitionSurfaceStyle,
} from "../../../styles/node-surface";
import { handleStyling } from "../../../styles/styling";
import { iconBadgeStyle } from "./node-card";
import { useTransitionFiringAnimation } from "./use-transition-firing-animation";

import type { TransitionNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
  height: "full",
});

const transitionBoxStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[10px]",
  padding: "[6px 12px]",
  textAlign: "left",
});

const transitionIconStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  flexShrink: "0",
  color: "neutral.s80",
});

const transitionTextStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  minWidth: "0",
});

const transitionLabelStyle = css({
  lineClamp: "2",
});

const transitionTypeStyle = css({
  fontSize: "[11px]",
  lineHeight: "[1.2]",
  color: "neutral.a90",
});

const stochasticIconStyle = css({
  color: "blue.s60",
});

const firingIndicatorStyle = css({
  position: "absolute",
  top: "[-8px]",
  right: "[-8px]",
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
  const label = withLabelWrapPoints(data.label);
  const subtitle =
    data.lambdaType === "none"
      ? "Transition"
      : data.lambdaType === "stochastic"
        ? "Stochastic"
        : "Predicate";

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
        className={`${nodeSurfaceStyle} ${nodeFocusStyle({ focus })} ${transitionSurfaceStyle} ${classicNodeBoxStyle} ${transitionBoxStyle}`}
      >
        <div className={transitionIconStyle}>
          <Icon name="squareFilled" size="lg" />
          {data.lambdaType === "stochastic" ? (
            <div className={`${iconBadgeStyle} ${stochasticIconStyle}`}>
              <Icon name="lambda" size="xs" />
            </div>
          ) : null}
        </div>
        <div className={transitionTextStyle}>
          <div className={`${classicNodeLabelStyle} ${transitionLabelStyle}`}>
            {label}
          </div>
          <div className={transitionTypeStyle}>{subtitle}</div>
        </div>
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
