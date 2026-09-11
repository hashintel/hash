import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { useFiringAnimation } from "../../../hooks/use-firing-animation";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { useSelectionVariant } from "../../../hooks/use-selection-variant";
import {
  classicNodeBoxStyle,
  classicNodeLabelStyle,
  classicNodeRowStyle,
} from "../../../styles/classic-node-layout";
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
  // Tighter than the circle's, so four lines of a name and the two rows
  // around them fit the square with room to spare.
  padding: "[2px 10px]",
  // The flat box leaves less room for a name than a circle does, so its
  // three lines are set smaller.
  fontSize: "[13px]",
});

const transitionRowStyle = css({
  height: "[12px]",
});

const transitionLabelStyle = css({
  lineClamp: "4",
});

const stochasticIconStyle = css({
  color: "blue.s60",
  fontSize: "lg",
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
        className={`${nodeSurfaceStyle({ selection: selectionVariant })} ${transitionSurfaceStyle} ${classicNodeBoxStyle} ${transitionBoxStyle}`}
      >
        <div className={`${classicNodeRowStyle} ${transitionRowStyle}`}>
          {data.lambdaType === "stochastic" ? (
            <div className={stochasticIconStyle}>
              <Icon name="lambda" size="sm" />
            </div>
          ) : null}
        </div>
        <div className={`${classicNodeLabelStyle} ${transitionLabelStyle}`}>
          {label}
        </div>
        <div className={`${classicNodeRowStyle} ${transitionRowStyle}`}>
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
