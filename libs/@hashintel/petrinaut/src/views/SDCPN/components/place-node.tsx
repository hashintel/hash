import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbCircleFilled, TbMathFunction } from "react-icons/tb";
import type { NodeProps } from "reactflow";

import { hexToHsl } from "../../../lib/hsl-color";
import { PlaybackContext } from "../../../playback/context";
import { SimulationContext } from "../../../simulation/context";
import { EditorContext } from "../../../state/editor-context";
import type { PlaceNodeData } from "../reactflow-types";
import {
  iconBadgeStyle,
  iconContainerBaseStyle,
  NodeCard,
  nodeCardStyle,
  type SelectionVariant,
} from "./node-card";

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
  fontSize: "[12px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "[white]",
  backgroundColor: "[black]",
  minWidth: "[20px]",
  height: "[20px]",
  borderRadius: "[10px]",
  padding: "[0 5px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
});

export const PlaceNode: React.FC<NodeProps<PlaceNodeData>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeData>) => {
  const { globalMode, selectedResourceId } = use(EditorContext);
  const isSimulateMode = globalMode === "simulate";
  const { initialMarking } = use(SimulationContext);
  const { currentViewedFrame } = use(PlaybackContext);

  // Get token count from the currently viewed frame or initial marking
  let tokenCount: number | null = null;
  if (currentViewedFrame) {
    tokenCount = currentViewedFrame.places[id]?.tokenCount ?? null;
  } else if (isSimulateMode) {
    // In simulate mode but no simulation running - show initial marking
    const marking = initialMarking.get(id);
    tokenCount = marking?.count ?? 0;
  }

  // Determine selection state
  const isSelectedByResource = selectedResourceId === id;
  const selectionVariant: SelectionVariant = isSelectedByResource
    ? "resource"
    : selected
      ? "reactflow"
      : "none";

  const subtitle = data.dynamicsEnabled ? "Place (Dynamics)" : "Place";

  const typeColorBorder = data.typeColor
    ? hexToHsl(data.typeColor).lighten(-10).saturate(-30).css(1)
    : undefined;

  const placeBackgroundColor = data.typeColor
    ? hexToHsl(data.typeColor).lighten(30).css(0.9)
    : "#FFFFFF";

  return (
    <NodeCard
      cardClassName={`${nodeCardStyle({ selection: selectionVariant })} ${placeCardStyle}`}
      cardStyle={{
        borderColor: typeColorBorder,
        backgroundColor: placeBackgroundColor,
      }}
      iconContainer={
        <div
          className={`${iconContainerBaseStyle} ${placeIconContainerStyle}`}
          style={{ color: typeColorBorder }}
        >
          <TbCircleFilled />
          {data.dynamicsEnabled && (
            <div className={`${iconBadgeStyle} ${dynamicsBadgeStyle}`}>
              <TbMathFunction />
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
  );
};
