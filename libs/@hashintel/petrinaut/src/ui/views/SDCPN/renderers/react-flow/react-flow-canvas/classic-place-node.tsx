import { Handle, type NodeProps, Position } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { splitPascalCase } from "../../../../../lib/split-pascal-case";
import {
  useFramesAvailable,
  usePlaceTokenCount,
} from "../../../canvas-frame-store";
import { nodeFocusStyle } from "../../../styles/focus";
import { handleStyling } from "../../../styles/styling";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PlaceNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  height: "full",
});

const placeCircleStyle = css({
  paddingY: "4",
  paddingX: "2",
  borderRadius: "[50%]",
  width: "full",
  height: "full",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "3",
  minWidth: "0",
  border: "2px solid color-mix(in oklab, black, white 35%)",
  fontSize: "[15px]",
  boxSizing: "border-box",
  position: "relative",
  textAlign: "center",
  lineHeight: "[1.3]",
  cursor: "default",
});

const dynamicsIconStyle = css({
  position: "absolute",
  top: "[25px]",
  left: "[0px]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  gap: "4",
  justifyContent: "center",
  color: "blue.s110",
  fontSize: "lg",
});

const labelContainerStyle = css({
  textAlign: "center",
  padding: "[12px 0]",
  lineHeight: "[1.1]",
  maxWidth: "[100%]",
  overflowWrap: "break-word",
  lineClamp: "3",
});

const tokenCountBadgeStyle = css({
  position: "absolute",
  top: "[70%]",
  fontSize: "base",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s00",
  backgroundColor: "[black]",
  minWidth: "[26px]",
  height: "[26px]",
  borderRadius: "[13px]",
  padding: "[0 6px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const ClassicPlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeType>) => {
  // Subscribed rather than carried on the node, so a frame re-renders this
  // place only when its own count moves.
  const tokenCount = usePlaceTokenCount(id);
  const framesAvailable = useFramesAvailable();

  // Show the visualizer on hover for places with a visualizer during simulation.
  const showStateTooltip =
    data.hasColorType && data.hasVisualizer && framesAvailable && data.hovered;

  // Add zero width space to labels between pascal case points as text-wrapping breakpoints
  const label = splitPascalCase(data.label).join("\u200B");

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
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
        className={`${placeCircleStyle} ${nodeFocusStyle({ focus })}`}
        style={{
          borderColor: placeBorderColor(data.typeColor),
          backgroundColor: placeFillColor(data.typeColor),
        }}
      >
        {data.dynamicsEnabled && (
          <div className={dynamicsIconStyle}>
            <Icon name="function" size="sm" />
          </div>
        )}
        <div className={labelContainerStyle}>{label}</div>
        {tokenCount !== null && (
          <div className={tokenCountBadgeStyle}>{tokenCount}</div>
        )}
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
