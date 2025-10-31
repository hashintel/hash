import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { useCallback } from "react";

import { useEditorContext } from "./editor-context";
import { placeStyling, transitionStyling } from "./styling";
import { useLayoutGraph } from "./use-layout-graph";

export const BottomBar = () => {
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, nodeType: "place" | "transition") => {
      event.dataTransfer.setData("application/reactflow", nodeType);

      // eslint-disable-next-line no-param-reassign
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const { petriNetDefinition } = useEditorContext();

  const layoutGraph = useLayoutGraph();

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
        <span
          className={css({
            fontSize: "size.textxs",
            fontWeight: "semibold",
            color: "core.gray.60",
            textTransform: "uppercase",
            letterSpacing: "[0.05em]",
          })}
        >
          New Process
        </span>
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
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "spacing.3",
        })}
      >
        <button
          type="button"
          onClick={() =>
            layoutGraph({
              nodes: petriNetDefinition.nodes,
              arcs: petriNetDefinition.arcs,
              animationDuration: 200,
            })
          }
          className={css({
            display: "block",
            fontWeight: "500",
            padding: "spacing.2",
            paddingX: "spacing.4",
            fontSize: "size.textxs",
            backgroundColor: "[transparent]",
            border: "1px solid",
            borderColor: "core.gray.30",
            borderRadius: "radius.4",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "[0.05em]",
            _hover: {
              backgroundColor: "core.gray.10",
            },
          })}
        >
          Layout
        </button>
      </div>
    </div>
  );
};
