import { css } from "@hashintel/ds-helpers/css";
import { TbMathFunction, TbPalette } from "react-icons/tb";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { useSimulationStore } from "../../../state/simulation-provider";
import type { PlaceNodeData } from "../../../state/types-for-editor-to-remove";
import { handleStyling } from "../styles/styling";

export const PlaceNode: React.FC<NodeProps<PlaceNodeData>> = ({
  id,
  data,
  isConnectable,
  selected,
}: NodeProps<PlaceNodeData>) => {
  const isSimulateMode = useEditorStore(
    (state) => state.globalMode === "simulate",
  );
  const simulation = useSimulationStore((state) => state.simulation);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
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
  return (
    <div
      className={css({
        position: "relative",
      })}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <div
        className={css({
          padding: "spacing.4",
          borderRadius: "[50%]",
          width: "[130px]",
          height: "[130px]",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: selected ? "core.blue.10" : "core.gray.10",
          border: "2px solid",
          borderColor: selected ? "core.blue.50" : "core.gray.50",
          fontSize: "[15px]",
          boxSizing: "border-box",
          position: "relative",
          textAlign: "center",
          lineHeight: "[1.3]",
          cursor: "default",
          _hover: {
            borderColor: selected ? "core.blue.60" : "core.gray.70",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)",
          },
        })}
        style={{ transition: "all 0.2s ease" }}
      >
        <div
          className={css({
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
          })}
        >
          {data.hasColorType && <TbPalette />}
          {data.dynamicsEnabled && <TbMathFunction />}
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "spacing.2",
          })}
        >
          <div>{data.label}</div>

          {tokenCount !== null && (
            <div
              className={css({
                position: "absolute",
                top: "[70%]",
                fontSize: "[11px]",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "[white]",
                backgroundColor: "[black]",
                width: "[20px]",
                height: "[20px]",
                borderRadius: "[50%]",
                fontWeight: "semibold",
              })}
            >
              {tokenCount}
            </div>
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
