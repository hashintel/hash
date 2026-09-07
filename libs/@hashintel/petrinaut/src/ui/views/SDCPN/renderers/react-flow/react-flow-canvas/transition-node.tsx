import { useEffect, useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { nodeFocusStyle } from "../../../styles/focus";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
} from "./node-card";

import type { TransitionNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

const FIRING_ANIMATION_DURATION_MS = 300;

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

/**
 * Hook to animate the transition box and lightning bolt when firing.
 * Uses Web Animations API for smooth, programmatic control.
 */
function useFiringAnimation(
  boxRef: React.RefObject<HTMLDivElement | null>,
  boltRef: React.RefObject<HTMLDivElement | null>,
  firingDelta: number | null,
): void {
  useEffect(() => {
    // Only animate when there's an actual firing (delta > 0)
    if (firingDelta === null || firingDelta <= 0) {
      return;
    }

    const box = boxRef.current;
    const bolt = boltRef.current;

    if (!box || !bolt) {
      return;
    }

    // Animate the box: flash yellow background and glow
    box.animate(
      [
        {
          background: "rgba(255, 224, 132, 0.7)",
          boxShadow: "0 0 6px 1px rgba(255, 132, 0, 0.59)",
        },
        {
          background: "rgb(247, 247, 247)",
          boxShadow: "0 0 0 0 rgba(255, 132, 0, 0)",
        },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS,
        easing: "ease-out",
        fill: "forwards",
      },
    );

    // Animate the lightning bolt: appear then fade out
    bolt.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.5)" },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS * 3,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      },
    );
  }, [firingDelta, boxRef, boltRef]);
}

export const TransitionNode: React.FC<NodeProps<TransitionNodeType>> = ({
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
