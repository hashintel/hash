import { css, cva } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { use, useEffect, useRef } from "react";
import { TbBolt, TbLambda } from "react-icons/tb";

import { EditorContext } from "../../../state/editor-context";
import { useFiringDelta } from "../hooks/use-firing-delta";
import type { TransitionNodeType } from "../reactflow-types";
import { handleStyling } from "../styles/styling";

const FIRING_ANIMATION_DURATION_MS = 300;

const containerStyle = css({
  position: "relative",
  background: "[transparent]",
});

const transitionBoxStyle = cva({
  base: {
    padding: "2",
    borderRadius: "xl",
    width: "[160px]",
    height: "[80px]",
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
    transition: "[outline 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      borderColor:
        "[color-mix(in oklab, var(--colors-neutral-s80), black 15%)]",
      outline: "[4px solid rgba(75, 126, 156, 0.08)]",
    },
    _after: {
      content: '""',
      transition: "[all 0.1s ease]",
      position: "absolute",
      pointerEvents: "none",
      borderRadius: "[inherit]",
      inset: "[-2px]",
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
      notSelectedConnection: {
        _after: {
          background: "[rgba(255, 255, 255, 0.5)]",
        },
      },
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
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

export const ClassicTransitionNode: React.FC<NodeProps<TransitionNodeType>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<TransitionNodeType>) => {
  const { label } = data;

  const {
    isSelected,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);

  // Refs for animated elements
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boltRef = useRef<HTMLDivElement | null>(null);

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data.frame?.firingCount ?? null);

  // Animate when firing occurs
  useFiringAnimation(boxRef, boltRef, firingDelta);

  // Determine selection state
  const selectionVariant = isSelected(id)
    ? "resource"
    : selected
      ? "reactflow"
      : isNotHoveredConnection(id) ||
          (!hoveredItem && isNotSelectedConnection(id))
        ? "notSelectedConnection"
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
        ref={boxRef}
        className={transitionBoxStyle({
          selection: selectionVariant,
        })}
      >
        {data.lambdaType === "stochastic" && (
          <div className={stochasticIconStyle}>
            <TbLambda />
          </div>
        )}
        <div className={labelStyle}>{label}</div>
        <div ref={boltRef} className={firingIndicatorStyle}>
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
