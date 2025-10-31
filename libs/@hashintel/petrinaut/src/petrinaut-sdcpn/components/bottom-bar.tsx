import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { useCallback } from "react";

import { placeStyling, transitionStyling } from "../styling";

export const BottomBar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

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
        gap: "spacing.6",
        zIndex: "[1000]",
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "spacing.4",
        })}
      >
        <div
          className={`${placeStyling} ${css({
            cursor: "grab",
            width: "[60px]",
            height: "[60px]",
            fontSize: "[12px]",
          })}`}
          draggable
          onDragStart={(event) => onDragStart(event, "place")}
        >
          Place
        </div>
        <div
          className={`${transitionStyling} ${css({
            cursor: "grab",
            width: "[80px]",
            height: "[40px]",
            fontSize: "[12px]",
          })}`}
          draggable
          onDragStart={(event) => onDragStart(event, "transition")}
        >
          Transition
        </div>
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
