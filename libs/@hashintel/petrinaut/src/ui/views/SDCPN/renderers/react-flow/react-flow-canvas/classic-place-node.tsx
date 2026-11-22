import { type NodeProps } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { withLabelWrapPoints } from "../../../../../lib/label-wrap-points";
import { usePlaceTokenLabel } from "../../../canvas-frame-store-context";
import {
  classicNodeBoxStyle,
  classicNodeLabelStyle,
  classicNodeRowStyle,
} from "../../../styles/classic-node-layout";
import { nodeFocusStyle } from "../../../styles/focus";
import { nodeSurfaceStyle } from "../../../styles/node-surface";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import { PlaceStateTooltip } from "./place-state-tooltip";
import { PortPins } from "./port-pin";
import { portPlaceLabels } from "./port-place-labels";
import { NodeHandles } from "./shared/node-handles";

import type { PlaceNodeType } from "./react-flow-types";

const containerStyle = css({
  position: "relative",
  height: "full",
});

const placeBoxStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "[2px]",
  textAlign: "center",
  // A circle, since the node is square.
  borderRadius: "[50%]",
  // Wider than the transition's, to keep the name clear of the curve.
  padding: "[8px 14px]",
});

const placeRowStyle = css({
  height: "[18px]",
  gap: "[4px]",
});

const portCaptionStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  lineHeight: "[1]",
  "--node-text": "var(--colors-neutral-s90)",
  color: "[var(--node-text)]",
  whiteSpace: "nowrap",
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
  "--node-text": "var(--colors-neutral-s00)",
  "--node-fill": "black",
  color: "[var(--node-text)]",
  backgroundColor: "[var(--node-fill)]",
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
  const tokenLabel = usePlaceTokenLabel(id);

  const showStateTooltip =
    data.hasVisualizer &&
    (data.visualizerKeptOpen || data.visualizerActive || selected);

  // Wrap points let a long name break inside the box instead of clipping.
  const label = withLabelWrapPoints(data.label);

  const focus = selected ? "focused" : data.focus;

  return (
    <div className={containerStyle}>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}

      <div
        className={`${nodeSurfaceStyle} ${nodeFocusStyle({ focus })} ${classicNodeBoxStyle} ${placeBoxStyle}`}
        style={
          {
            "--node-outline-color": placeBorderColor(data.typeColor),
            "--node-fill": placeFillColor(data.typeColor),
          } as React.CSSProperties
        }
      >
        <div className={`${classicNodeRowStyle} ${placeRowStyle}`}>
          {data.dynamicsEnabled ? (
            <div className={dynamicsIconStyle}>
              <Icon name="function" size="sm" />
            </div>
          ) : null}
          {data.portDirection === null ? null : (
            <span className={`node-text ${portCaptionStyle}`}>
              {portPlaceLabels[data.portDirection]}
            </span>
          )}
        </div>
        <div className={`${classicNodeLabelStyle} ${placeLabelStyle}`}>
          {label}
        </div>
        <div className={`${classicNodeRowStyle} ${placeRowStyle}`}>
          {tokenLabel === null ? null : (
            <div className={`node-cover node-text ${tokenCountBadgeStyle}`}>
              {tokenLabel}
            </div>
          )}
        </div>
        {data.portDirection === null ? null : (
          <PortPins direction={data.portDirection} typeColor={data.typeColor} />
        )}
      </div>
      <NodeHandles
        kind="place"
        width={data.width}
        height={data.height}
        isConnectable={isConnectable}
      />
    </div>
  );
};
