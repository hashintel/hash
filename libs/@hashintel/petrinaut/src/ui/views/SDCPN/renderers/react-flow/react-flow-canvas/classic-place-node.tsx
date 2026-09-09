import { Handle, type NodeProps, Position } from "@xyflow/react";
import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../../../../../react/execution-frame/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { useSelectionVariant } from "../../../hooks/use-selection-variant";
import {
  classicNodeBoxStyle,
  classicNodeLabelStyle,
  classicNodeRowStyle,
} from "../../../styles/classic-node-layout";
import { nodeSurfaceStyle } from "../../../styles/node-surface";
import { handleStyling } from "../../../styles/styling";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PlaceNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  height: "full",
});

const placeBoxStyle = css({
  // A circle, since the node is square.
  borderRadius: "[50%]",
  // Wider than the transition's, to keep the name clear of the curve.
  padding: "[8px 20px]",
  gap: "[4px]",
});

const placeRowStyle = css({
  height: "[18px]",
});

const dynamicsIconStyle = css({
  color: "blue.s110",
  fontSize: "lg",
});

const tokenCountBadgeStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[18px]",
  minWidth: "[22px]",
  borderRadius: "[9px]",
  padding: "[0 6px]",
  fontSize: "sm",
  color: "neutral.s00",
  backgroundColor: "[black]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const ClassicPlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeType>) => {
  const { globalMode, isHovered } = use(EditorContext);
  const isSimulateMode = globalMode === "simulate";
  const { initialMarking } = use(SimulationContext);
  const { currentViewedFrame, totalFrames } = use(ExecutionFrameSourceContext);

  // Show the visualizer on hover for places with a visualizer during simulation.
  const showStateTooltip =
    data.hasColorType && data.hasVisualizer && totalFrames > 0 && isHovered(id);

  // Get token count from the currently viewed frame or initial marking
  let tokenCount: number | null = null;
  if (currentViewedFrame) {
    tokenCount = currentViewedFrame.places[id]?.tokenCount ?? null;
  } else if (isSimulateMode) {
    // In simulate mode but no simulation running - show initial marking
    const marking = initialMarking[id];
    tokenCount = typeof marking === "number" ? marking : (marking?.length ?? 0);
  }

  // Wrap points let a long name break inside the box instead of clipping.
  const label = withLabelWrapPoints(data.label);

  const selectionVariant = useSelectionVariant(id, selected);

  return (
    <div className={containerStyle}>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div
        className={`${nodeSurfaceStyle({ selection: selectionVariant })} ${classicNodeBoxStyle} ${placeBoxStyle}`}
        style={
          {
            "--node-outline-color": placeBorderColor(data.typeColor),
            backgroundColor: placeFillColor(data.typeColor),
          } as React.CSSProperties
        }
      >
        <div className={`${classicNodeRowStyle} ${placeRowStyle}`}>
          {data.dynamicsEnabled ? (
            <div className={dynamicsIconStyle}>
              <Icon name="function" size="sm" />
            </div>
          ) : null}
        </div>
        <div className={classicNodeLabelStyle}>{label}</div>
        <div className={`${classicNodeRowStyle} ${placeRowStyle}`}>
          {tokenCount === null ? null : (
            <div className={tokenCountBadgeStyle}>{tokenCount}</div>
          )}
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
