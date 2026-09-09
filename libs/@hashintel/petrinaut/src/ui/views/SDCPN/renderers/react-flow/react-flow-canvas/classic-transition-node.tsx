import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
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
  padding: "[10px]",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "[4px]",
  fontSize: "[14px]",
});

/**
 * The rows above and below the label are always in the layout, so the label
 * sits at the same height on every transition and whatever they hold appears
 * over or under it rather than pushing it aside.
 */
const iconRowStyle = css({
  height: "[18px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  lineHeight: "[1]",
});

const stochasticIconStyle = css({
  color: "blue.s60",
  fontSize: "lg",
});

const labelStyle = css({
  textAlign: "center",
  maxWidth: "[100%]",
  overflowWrap: "break-word",
  textOverflow: "ellipsis",
  overflow: "hidden",
  lineClamp: "3",
  lineHeight: "[1.2]",
});

const firingIndicatorStyle = css({
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
  // Wrap points let a long name break inside the square instead of clipping.
  const label = withLabelWrapPoints(data.label);

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
        <div className={iconRowStyle}>
          {data.lambdaType === "stochastic" ? (
            <div className={stochasticIconStyle}>
              <Icon name="lambda" size="sm" />
            </div>
          ) : null}
        </div>
        <div className={labelStyle}>{label}</div>
        <div className={iconRowStyle}>
          <div ref={boltRef} className={firingIndicatorStyle}>
            <Icon name="lightning" size="sm" />
          </div>
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
