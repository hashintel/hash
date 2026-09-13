import { Handle, type NodeProps, Position } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { usePlaceTokenCount } from "../../../canvas-frame-store";
import {
  classicNodeBoxStyle,
  classicNodeLabelStyle,
  classicNodeRowStyle,
} from "../../../styles/classic-node-layout";
import { nodeFocusStyle } from "../../../styles/focus";
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
  fontSize: "[15px]",
});

const placeRowStyle = css({
  height: "[18px]",
});

const placeLabelStyle = css({
  lineClamp: "3",
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
  // A frame re-renders this place only when its own count moves.
  const tokenCount = usePlaceTokenCount(id);

  // Show the visualizer on hover for places that define one, and keep it up
  // for as long as it is pinned. Before a run it draws the initial marking,
  // so a net still being built is worth pointing at too.
  const showStateTooltip =
    data.hasColorType &&
    data.hasVisualizer &&
    // Dragging the place would carry the box along over the canvas it is
    // being dropped on, and redraw the visualizer every frame of the drag.
    !data.dragging &&
    (data.hovered || data.visualizerPinned);

  // Wrap points let a long name break inside the box instead of clipping.
  const label = withLabelWrapPoints(data.label);

  const focus = selected ? "focused" : data.focus;

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
        className={`${nodeSurfaceStyle} ${nodeFocusStyle({ focus })} ${classicNodeBoxStyle} ${placeBoxStyle}`}
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
        <div className={`${classicNodeLabelStyle} ${placeLabelStyle}`}>
          {label}
        </div>
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
