import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { useCallback } from "react";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

export const BottomBar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

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
    <div
      className={css({
        position: "fixed",
        bottom: "spacing.6",
        left: "[50%]",
        transform: "translateX(-50%)",
        background: "[white]",
        padding: "spacing.4",
        paddingX: "spacing.6",
        borderRadius: "radius.8",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
        border: "1px solid",
        borderColor: "core.gray.20",
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
    </div>
  );
};
