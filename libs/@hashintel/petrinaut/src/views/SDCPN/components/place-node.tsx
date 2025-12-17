import { css, cva } from "@hashintel/ds-helpers/css";
import { TbMathFunction } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { splitPascalCase } from "../../../lib/split-pascal-case";
import { useEditorStore } from "../../../state/editor-provider";
import { useSimulationStore } from "../../../state/simulation-provider";
import type { PlaceNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

const containerStyle = css({
  position: "relative",
});

const placeCircleStyle = cva({
  base: {
    padding: "spacing.4",
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
    _hover: {
      boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
    },
  },
  variants: {
    selection: {
      resource: {
        boxShadow:
          "0 0 0 3px rgba(59, 178, 246, 0.4), 0 0 0 5px rgba(59, 190, 246, 0.2)",
      },
      reactflow: {
        boxShadow:
          "0 0 0 4px rgba(249, 115, 22, 0.4), 0 0 0 6px rgba(249, 115, 22, 0.2)",
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
  gap: "spacing.4",
  justifyContent: "center",
  color: "core.blue.60",
  fontSize: "[18px]",
});

const contentWrapperStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "spacing.2",
});

const labelContainerStyle = css({
  textAlign: "center",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  padding: "[12px]",
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
  width: "[27px]",
  height: "[27px]",
  borderRadius: "[50%]",
  fontWeight: "semibold",
});

export const PlaceNode: React.FC<NodeProps<PlaceNodeData>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeData>) => {
  const isSimulateMode = useEditorStore(
    (state) => state.globalMode === "simulate"
  );
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId
  );
  const simulation = useSimulationStore((state) => state.simulation);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame
  );
  const initialMarking = useSimulationStore((state) => state.initialMarking);

  // Get token count from the currently viewed frame or initial marking
  let tokenCount: number | null = null;
  if (simulation && simulation.frames.length > 0) {
    const frame = simulation.frames[currentlyViewedFrame];
    const placeData = frame?.places.get(id);
    if (placeData) {
      tokenCount = placeData.count;
    }
  } else if (isSimulateMode && !simulation) {
    // In simulate mode but no simulation running - show initial marking
    const marking = initialMarking.get(id);
    tokenCount = marking?.count ?? 0;
  }

  // Helper function to convert hex color to rgba with opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  };

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
          borderColor: data.typeColor ?? undefined,
          backgroundColor: data.typeColor
            ? hexToRgba(data.typeColor, 0.1)
            : undefined,
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
