import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useEffect, useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useTransitionFrame } from "../../../canvas-frame-store";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { nodeFocusStyle } from "../../../styles/focus";
import { handleStyling } from "../../../styles/styling";

import type { TransitionNodeType } from "./react-flow-types";

const FIRING_ANIMATION_DURATION_MS = 300;

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

    // Flash the box yellow with a glow. Only the flash is a keyframe: the
    // animation runs back to whatever the stylesheet says, so the focus ring's
    // white band in `box-shadow` returns once it is over instead of staying
    // replaced by the glow's transparent end.
    box.animate(
      [
        {
          background: "rgba(255, 224, 132, 0.7)",
          boxShadow: "0 0 6px 1px rgba(255, 132, 0, 0.59)",
          offset: 0,
        },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS,
        easing: "ease-out",
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
  const frame = useTransitionFrame(id);
  const firingDelta = useFiringDelta(frame?.firingCount ?? null);

  // Animate when firing occurs
  useFiringAnimation(boxRef, boltRef, firingDelta);

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
