import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useCanvasActions } from "./canvas-actions";

import type { ConnectionEdge as ConnectionEdgeType } from "./flow-graph";
import type { EdgeProps } from "@xyflow/react";

/** Keeps × up long enough for the pointer to reach it. */
const hideDelayMs = 150;

const disconnect = css({ position: "absolute", pointerEvents: "all" });

export const ConnectionEdge = ({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<ConnectionEdgeType>) => {
  const { removeConnection } = useCanvasActions();
  const [hovered, setHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const connection = data?.kind === "connection" ? data.connection : null;

  const hover = connection
    ? {
        onMouseEnter: () => {
          clearTimeout(hideTimerRef.current);
          setHovered(true);
        },
        onMouseLeave: () => {
          hideTimerRef.current = setTimeout(
            () => setHovered(false),
            hideDelayMs,
          );
        },
      }
    : {};

  return (
    <>
      <g {...hover}>
        <BaseEdge
          id={id}
          path={path}
          interactionWidth={16}
          style={{
            stroke:
              selected || hovered
                ? "var(--colors-blue-bd-strong)"
                : "var(--colors-neutral-bd-strong)",
            strokeWidth: 1,
          }}
        />
      </g>
      {connection && hovered && (
        <EdgeLabelRenderer>
          <div
            className={cx(disconnect, "nodrag nopan")}
            {...hover}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <Button
              variant="subtle"
              size="xxs"
              shape="round"
              iconName="close"
              tooltip="Disconnect"
              aria-label="Disconnect"
              onClick={() => removeConnection(connection)}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
