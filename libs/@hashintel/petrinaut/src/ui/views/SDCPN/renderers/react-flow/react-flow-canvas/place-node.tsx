import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePlaceTokenLabel } from "../../../canvas-frame-store-context";
import { nodeFocusStyle } from "../../../styles/focus";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import { NodeCard } from "./node-card";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  nodeCardStyle,
} from "./node-card-styles";
import { PlaceStateTooltip } from "./place-state-tooltip";
import { PortPins } from "./port-pin";
import { portPlaceLabels } from "./port-place-labels";
import { NodeHandles } from "./shared/node-handles";

import type { PlaceNodeType } from "./react-flow-types";
import type { NodeProps } from "@xyflow/react";

/**
 * A place's fill is its token type's colour, and its icon box lies on that
 * fill in a colour of its own. With each at 0.25 the box would be tinted by
 * the fill, and would hide more of what is behind the place than the rest of
 * the card does. So the fill of a faded place is a gradient that leaves a
 * hole under the box.
 *
 * A gradient cannot fade, so the colour under it does. As the place fades,
 * the gradient is there from the start and the colour runs out under it. As
 * it comes back, the colour returns under the gradient, which goes once the
 * fade is over: `nodeFocusStyle` holds that delay.
 */
const placeCardStyle = css({
  borderRadius: "full",
  "--node-faded-fill": "transparent",
  "--node-faded-fill-image":
    "radial-gradient(circle at 24px 50%, transparent 19.5px, color-mix(in srgb, var(--node-fill) 25%, transparent) 20.5px)",
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
  "--node-text": "var(--colors-neutral-s00)",
  "--node-fill": "black",
  color: "[var(--node-text)]",
  backgroundColor: "[var(--node-fill)]",
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

  const kind =
    data.portDirection === null ? "Place" : portPlaceLabels[data.portDirection];
  const subtitle = data.dynamicsEnabled ? `${kind} (Dynamics)` : kind;

  const typeColorBorder = placeBorderColor(data.typeColor);

  const placeBackgroundColor = placeFillColor(data.typeColor);

  return (
    <>
      {showStateTooltip && <PlaceStateTooltip nodeId={id} />}
      <NodeCard
        cardClassName={`${nodeCardStyle} ${placeCardStyle} ${nodeFocusStyle({ focus })}`}
        cardStyle={
          {
            "--node-border": typeColorBorder,
            "--node-fill": placeBackgroundColor,
          } as React.CSSProperties
        }
        iconContainer={
          <div
            className={`node-fill ${iconContainerBaseStyle} ${placeIconContainerStyle}`}
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
              <div className={`node-cover node-text ${tokenCountBadgeStyle}`}>
                {tokenLabel}
              </div>
            ) : null}
            {data.portDirection === null ? null : (
              <PortPins
                direction={data.portDirection}
                typeColor={data.typeColor}
              />
            )}
          </>
        }
      >
        <NodeHandles
          kind="place"
          width={data.width}
          height={data.height}
          isConnectable={isConnectable}
        />
      </NodeCard>
    </>
  );
};
