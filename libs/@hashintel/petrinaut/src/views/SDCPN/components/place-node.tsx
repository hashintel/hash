import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbMathFunction } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { hexToHsl } from "../../../lib/hsl-color";
import { splitPascalCase } from "../../../lib/split-pascal-case";
import { PlaybackContext } from "../../../playback/context";
import { SimulationContext } from "../../../simulation/context";
import { EditorContext } from "../../../state/editor-context";
import type { PlaceNodeData } from "../reactflow-types";
import { handleStyling } from "../styles/styling";

const containerStyle = css({
  position: "relative",
});

const placeCircleStyle = cva({
  base: {
    padding: "4",
    borderRadius: "[50%]",
    width: "[130px]",
    height: "[130px]",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "2px solid",
    fontSize: "[15px]",
    boxSizing: "border-box",
    position: "relative",
    textAlign: "center",
    lineHeight: "[1.3]",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
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
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
  },
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
  fontSize: "[18px]",
});

const contentWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "3",
});

const labelContainerStyle = css({
  textAlign: "center",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  padding: "[12px]",
  lineHeight: "[1.1]",
});

const labelSegmentStyle = css({
  display: "inline-block",
  whiteSpace: "nowrap",
});

const tokenCountBadgeStyle = css({
  position: "absolute",
  top: "[70%]",
  fontSize: "[16px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "[white]",
  backgroundColor: "[black]",
  minWidth: "[26px]",
  height: "[26px]",
  borderRadius: "[13px]",
  padding: "[0 6px]",
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
  const selectionVariant = isSelectedByResource
    ? "resource"
    : selected
      ? "reactflow"
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
        className={placeCircleStyle({ selection: selectionVariant })}
        style={{
          borderColor: data.typeColor
            ? hexToHsl(data.typeColor).lighten(-10).saturate(-30).css(1)
            : undefined,
          backgroundColor: data.typeColor
            ? hexToHsl(data.typeColor).lighten(30).css(0.8)
            : "#FCFCFACC",
        }}
      >
        {data.dynamicsEnabled && (
          <div className={dynamicsIconStyle}>
            <TbMathFunction />
          </div>
        )}
        <div className={contentWrapperStyle}>
          <div className={labelContainerStyle}>
            {splitPascalCase(data.label).map((segment, index) => (
              <span
                key={segment + index.toString()}
                className={labelSegmentStyle}
              >
                {segment}
              </span>
            ))}
          </div>

          {tokenCount !== null && (
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
