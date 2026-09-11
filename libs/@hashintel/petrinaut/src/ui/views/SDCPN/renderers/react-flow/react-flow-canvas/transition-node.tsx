import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useTransitionFrame } from "../../../canvas-frame-store";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { nodeFocusStyle } from "../../../styles/focus";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
} from "./node-card";
import { useTransitionFiringAnimation } from "./use-transition-firing-animation";

import type { TransitionNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

const transitionCardStyle = css({
  borderColor: "neutral.s70",
  background: "neutral.s00",
  _hover: {
    borderColor: "neutral.s100",
  },
});

const transitionIconContainerStyle = css({
  borderRadius: "[0px]",
});

const stochasticBadgeStyle = css({
  color: "blue.s60",
});

const firingIndicatorStyle = css({
  position: "absolute",
  top: "[-8px]",
  right: "[-8px]",
  fontSize: "base",
  color: "yellow.s60",
  opacity: "[0]",
  transform: "scale(0.5)",
});

export const TransitionNode: React.FC<NodeProps<TransitionNodeType>> = ({
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

  const subtitle =
    data.lambdaType === "none"
      ? "Transition"
      : data.lambdaType === "stochastic"
        ? "Stochastic"
        : "Predicate";

  return (
    <NodeCard
      cardClassName={`${nodeCardStyle} ${transitionCardStyle} ${nodeFocusStyle({ focus })}`}
      cardRef={boxRef}
      iconContainer={
        <div
          className={`${iconContainerBaseStyle} ${transitionIconContainerStyle}`}
        >
          <Icon name="squareFilled" />
          {data.lambdaType === "stochastic" && (
            <div className={`${iconBadgeStyle} ${stochasticBadgeStyle}`}>
              <Icon name="lambda" size="xs" />
            </div>
          )}
        </div>
      }
      title={label}
      subtitle={subtitle}
      badge={
        <div ref={boltRef} className={firingIndicatorStyle}>
          <Icon name="lightning" />
        </div>
      }
      isConnectable={isConnectable}
    />
  );
};
