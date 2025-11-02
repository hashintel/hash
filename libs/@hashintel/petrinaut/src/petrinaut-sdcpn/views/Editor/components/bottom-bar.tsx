import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

export const BottomBar: React.FC = () => {
  function onDragStart(
    event: DragEvent<HTMLDivElement>,
    nodeType: "place" | "transition",
  ) {
    event.dataTransfer.setData("application/reactflow", nodeType);

    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.effectAllowed = "move";
  }

  const iconContainerStyle = css({
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[50px]",
    height: "[50px]",
    fontSize: "[24px]",
    color: "core.gray.70",
    "&:hover": {
      color: "core.gray.90",
    },
  });

  return (
    <RefractivePane
      radius={12}
      blur={1.5}
      specularOpacity={0}
      scaleRatio={1}
      bezelWidth={20}
      glassThickness={120}
      refractiveIndex={1.5}
      className={css({
        position: "fixed",
        bottom: "spacing.6",
        left: "[50%]",
        transform: "translateX(-50%)",
        padding: "spacing.4",
        paddingX: "spacing.6",
        borderRadius: "[12px]",
        backgroundColor: "[rgba(255, 255, 255, 0.8)]",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        gap: "spacing.4",
        zIndex: "[1000]",
      })}
    >
      <div className={iconContainerStyle}>
        <FaArrowPointer />
      </div>
      <div className={iconContainerStyle}>
        <FaHand />
      </div>
      <div
        className={iconContainerStyle}
        draggable
        onDragStart={(event) => onDragStart(event, "place")}
      >
        <FaCircle />
      </div>
      <div
        className={iconContainerStyle}
        draggable
        onDragStart={(event) => onDragStart(event, "transition")}
      >
        <FaSquare />
      </div>
      <div
        className={css({
          background: "core.gray.20",
          width: "[1px]",
          height: "[40px]",
        })}
      />
    </RefractivePane>
  );
};
