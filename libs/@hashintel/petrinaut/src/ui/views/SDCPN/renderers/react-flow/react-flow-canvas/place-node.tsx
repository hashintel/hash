import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePlaceTokenLabel } from "../../../canvas-frame-store";
import { nodeFocusStyle } from "../../../styles/focus";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
} from "./node-card";
import { PlaceStateTooltip } from "./place-state-tooltip";
import { portPlaceLabel, PortPins } from "./port-pin";

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
  // A count across runs reads as a mean and its spread, on one line.
  whiteSpace: "nowrap",
});

export const PlaceNode: React.FC<NodeProps<PlaceNodeType>> = ({
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

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const kind = data.port === null ? "Place" : portPlaceLabel(data.port);
  const subtitle = data.dynamicsEnabled ? `${kind} (Dynamics)` : kind;

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
          <>
            {tokenLabel !== null ? (
              <div className={tokenCountBadgeStyle}>{tokenLabel}</div>
            ) : null}
            {data.port === null ? null : (
              <PortPins direction={data.port} typeColor={data.typeColor} />
            )}
          </>
        }
        isConnectable={isConnectable}
      />
    </>
  );
};
