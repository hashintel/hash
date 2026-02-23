import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef } from "react";
import { TbBolt, TbLambda, TbSquareFilled } from "react-icons/tb";
import type { NodeProps } from "reactflow";

import { EditorContext } from "../../../state/editor-context";
import { useFiringDelta } from "../hooks/use-firing-delta";
import type { TransitionNodeData } from "../reactflow-types";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
  type SelectionVariant,
} from "./node-card";

const FIRING_ANIMATION_DURATION_MS = 300;

const transitionCardStyle = css({
  borderRadius: "[0px]",
  borderColor: "neutral.s80",
  background: "neutral.s20",
  transition: "[outline 0.2s ease, border-color 0.2s ease]",
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
  fontSize: "[16px]",
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

export const TransitionNode: React.FC<NodeProps<TransitionNodeData>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<TransitionNodeData>) => {
  const { label } = data;

  const { selectedResourceId } = use(EditorContext);

  // Refs for animated elements
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boltRef = useRef<HTMLDivElement | null>(null);

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data.frame?.firingCount ?? null);

  // Animate when firing occurs
  useFiringAnimation(boxRef, boltRef, firingDelta);

  // Determine selection state
  const isSelectedByResource = selectedResourceId === id;
  const selectionVariant: SelectionVariant = isSelectedByResource
    ? "resource"
    : selected
      ? "reactflow"
      : "none";

  const subtitle =
    data.lambdaType === "stochastic" ? "Stochastic" : "Predicate";

  return (
    <NodeCard
      cardClassName={`${nodeCardStyle({ selection: selectionVariant })} ${transitionCardStyle}`}
      cardRef={boxRef}
      iconContainer={
        <div
          className={`${iconContainerBaseStyle} ${transitionIconContainerStyle}`}
        >
          <TbSquareFilled />
          {data.lambdaType === "stochastic" && (
            <div className={`${iconBadgeStyle} ${stochasticBadgeStyle}`}>
              <TbLambda />
            </div>
          )}
        </div>
      }
      title={label}
      subtitle={subtitle}
      badge={
        <div ref={boltRef} className={firingIndicatorStyle}>
          <TbBolt />
        </div>
      }
      isConnectable={isConnectable}
    />
  );
};
