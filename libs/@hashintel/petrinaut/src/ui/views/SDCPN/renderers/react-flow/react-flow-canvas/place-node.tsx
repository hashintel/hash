import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePlaceTokenCount } from "../../../canvas-frame-store";
import { nodeFocusStyle } from "../../../styles/focus";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
} from "./node-card";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PlaceNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

const placeCardStyle = css({
  borderRadius: "full",
});

const placeIconContainerStyle = css({
  borderRadius: "full",
});

const dynamicsBadgeStyle = css({
  color: "blue.s110",
});

const tokenCountBadgeStyle = css({
  position: "absolute",
  top: "[-8px]",
  right: "[-8px]",
  fontSize: "xs",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s00",
  backgroundColor: "[black]",
  minWidth: "[20px]",
  height: "[20px]",
  borderRadius: "[10px]",
  padding: "[0 5px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const PlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
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

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const subtitle = data.dynamicsEnabled ? "Place (Dynamics)" : "Place";

  const typeColorBorder = placeBorderColor(data.typeColor);

  const placeBackgroundColor = placeFillColor(data.typeColor);

  return (
    <>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}
      <NodeCard
        cardClassName={`${nodeCardStyle} ${placeCardStyle} ${nodeFocusStyle({ focus })}`}
        cardStyle={{
          borderColor: typeColorBorder,
          backgroundColor: placeBackgroundColor,
        }}
        iconContainer={
          <div
            className={`${iconContainerBaseStyle} ${placeIconContainerStyle}`}
            style={{ color: typeColorBorder }}
          >
            <Icon name="circleFilled" />
            {data.dynamicsEnabled && (
              <div className={`${iconBadgeStyle} ${dynamicsBadgeStyle}`}>
                <Icon name="function" size="xs" />
              </div>
            )}
          </div>
        }
        title={data.label}
        subtitle={subtitle}
        badge={
          tokenCount !== null ? (
            <div className={tokenCountBadgeStyle}>{tokenCount}</div>
          ) : undefined
        }
        isConnectable={isConnectable}
      />
    </>
  );
};
