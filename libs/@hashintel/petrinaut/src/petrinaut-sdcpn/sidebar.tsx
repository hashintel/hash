import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { useCallback } from "react";

import { useEditorContext } from "./editor-context";
import { placeStyling, transitionStyling } from "./styling";
import { useLayoutGraph } from "./use-layout-graph";

export const Sidebar = () => {
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
    <aside
      className={css({
        background: "core.gray.10",
        padding: "spacing.6",
        borderRight: "1px solid",
        borderRightColor: "core.gray.30",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "spacing.6",
      })}
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "spacing.6",
        })}
      >
        <div
          className={`${placeStyling} ${css({
            cursor: "grab",
            width: "[80px]",
            height: "[80px]",
            fontSize: "[14px]",
          })}`}
          draggable
          onDragStart={(event) => onDragStart(event, "place")}
        >
          Place
        </div>
        <div
          className={`${transitionStyling} ${css({
            cursor: "grab",
            width: "[100px]",
            height: "[50px]",
            fontSize: "[14px]",
          })}`}
          draggable
          onDragStart={(event) => onDragStart(event, "transition")}
        >
          Transition
        </div>
      </div>
      <div
        className={css({
          background: "core.gray.30",
          height: "[1px]",
          width: "[100%]",
          my: "spacing.6",
        })}
      />
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "spacing.6",
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
            fontWeight: "400",
            padding: "spacing.2",
            paddingX: "spacing.3",
            fontSize: "size.textxs",
            backgroundColor: "[transparent]",
            border: "1px solid",
            borderColor: "core.gray.30",
            borderRadius: "radius.4",
            cursor: "pointer",
            _hover: {
              backgroundColor: "core.gray.10",
            },
          })}
        >
          Layout
        </button>
      </div>
    </aside>
  );
};
