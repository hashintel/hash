import { css, cva } from "@hashintel/ds-helpers/css";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { use } from "react";
import { TbMathFunction } from "react-icons/tb";

import { hexToHsl } from "../../../lib/hsl-color";
import { splitPascalCase } from "../../../lib/split-pascal-case";
import { PlaybackContext } from "../../../playback/context";
import { SimulationContext } from "../../../simulation/context";
import { EditorContext } from "../../../state/editor-context";
import type { PlaceNodeType } from "../reactflow-types";
import { handleStyling } from "../styles/styling";

const containerStyle = css({
  position: "relative",
});

const placeCircleStyle = cva({
  base: {
    paddingY: "4",
    paddingX: "2",
    borderRadius: "[50%]",
    width: "[130px]",
    height: "[130px]",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "3",
    minWidth: "0",
    border: "2px solid color-mix(in oklab, black, white 35%)",
    backgroundColor: "neutral.s10",
    fontSize: "[15px]",
    boxSizing: "border-box",
    position: "relative",
    textAlign: "center",
    lineHeight: "[1.3]",
    cursor: "default",
    transition: "[outline 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
    },
    _after: {
      content: '""',
      transition: "[all 0.1s ease]",
      position: "absolute",
      pointerEvents: "none",
      borderRadius: "[inherit]",
      inset: "[-2px]", // override to cover border, since parent uses box-sizing border-box
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
      notSelectedConnection: {
        borderColor: "neutral.s80",
        _after: {
          background: "[rgba(255, 255, 255, 0.5)]",
        },
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
  const {
    globalMode,
    isSelected,
    isNotSelectedConnection,
    isNotHoveredConnection,
    hoveredItem,
  } = use(EditorContext);
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

  // Add zero width space to labels between pascal case points as text-wrapping breakpoints
  const label = splitPascalCase(data.label).join("\u200B");

  // Determine selection state
  const isInSelection = isSelected(id);
  const selectionVariant = isInSelection
    ? "resource"
    : selected
      ? "reactflow"
      : isNotHoveredConnection(id) ||
          (!hoveredItem && isNotSelectedConnection(id))
        ? "notSelectedConnection"
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
            ? hexToHsl(data.typeColor).lighten(35).css(1)
            : undefined,
        }}
      >
        {data.dynamicsEnabled && (
          <div className={dynamicsIconStyle}>
            <TbMathFunction />
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
