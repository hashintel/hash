import { useRef } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useFiringAnimation } from "../../../hooks/use-firing-animation";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import { useSelectionVariant } from "../../../hooks/use-selection-variant";
import { transitionSurfaceStyle } from "../../../styles/node-surface";
import { iconBadgeStyle, iconContainerBaseStyle, NodeCard } from "./node-card";

import type { TransitionNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

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

  const subtitle =
    data.lambdaType === "none"
      ? "Transition"
      : data.lambdaType === "stochastic"
        ? "Stochastic"
        : "Predicate";

  return (
    <NodeCard
      selection={selectionVariant}
      cardClassName={transitionSurfaceStyle}
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
