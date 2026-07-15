import { useCallback, useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LoadingSpinner } from "../../Loading/loading-spinner";
import { Popover } from "../../Popover/popover";
// Imported with `?url` so the ~23 MB of fixtures are served as static assets
// and parsed at runtime, rather than inlined into the story bundle.
import edgesUrl from "./fixtures/edges.json?url";
import pointsUrl from "./fixtures/points.json?url";
import {
  NetworkGraph,
  type NetworkGraphEdge,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphProps,
} from "./network-graph";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Chart/NetworkGraph",
  argTypes: {},
  args: {},
} satisfies StoryDefault<NetworkGraphProps>;

interface GraphData {
  points: NetworkGraphPoint[];
  edges: NetworkGraphEdge[];
}

const useGraphData = (): GraphData | null => {
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    // Mutable holder so the cleanup can cancel a late-arriving fetch without
    // tripping control-flow narrowing on a plain boolean.
    const status = { active: true };
    void (async () => {
      const [points, edges] = await Promise.all([
        fetch(pointsUrl).then(
          (response) => response.json() as Promise<NetworkGraphPoint[]>,
        ),
        fetch(edgesUrl).then(
          (response) => response.json() as Promise<NetworkGraphEdge[]>,
        ),
      ]);
      if (status.active) {
        setData({ points, edges });
      }
    })();
    return () => {
      status.active = false;
    };
  }, []);

  return data;
};

const frameStyles = css({
  position: "relative",
  width: "full",
  height: "[80vh]",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "neutral.s20",
  borderRadius: "md",
  overflow: "hidden",
});

const centreStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "3",
  width: "full",
  height: "full",
  color: "neutral.s60",
  fontSize: "sm",
});

// Visual chrome only — the `Popover` positioner handles placement and layering.
const tooltipStyles = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "sm",
  backgroundColor: "[rgba(15, 18, 25, 0.92)]",
  color: "white",
  fontSize: "xs",
  lineHeight: "snug",
  pointerEvents: "none",
  userSelect: "none",
});

/**
 * A 200k-node / 300k-edge scatterplot rendered with deck.gl. Edges are hidden
 * by default; hover a node to reveal its connections and neighbours, and click a
 * node to inspect it. Scroll to zoom and drag to pan.
 */
export const Default: Story<NetworkGraphProps> = () => {
  const data = useGraphData();
  // The frame is the popover's trigger; `positionFromPoint` then anchors the
  // tooltip at a point measured from the frame's top-left.
  const frameRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<NetworkGraphPoint | null>(null);
  // The selected node's live on-screen position, updated by the chart as the
  // user zooms/pans so the tooltip tracks the node.
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const handleClick = useCallback((interaction: NetworkGraphInteraction) => {
    setSelected(interaction.point);
  }, []);

  const handleNodeHover = useCallback(
    (interaction: NetworkGraphInteraction) => {
      // Clear the selection when a different node is hovered, but keep it when the
      // pointer moves onto empty space.
      if (interaction.point) {
        setSelected(null);
      }
    },
    [],
  );

  return (
    <div ref={frameRef} className={frameStyles}>
      {data ? (
        <>
          <NetworkGraph
            points={data.points}
            edges={data.edges}
            selected={selected?.id ?? null}
            onNodeClick={handleClick}
            onNodeHover={handleNodeHover}
            onSelectedPositionChange={setTooltipPos}
          />
          {selected && tooltipPos ? (
            <Popover
              triggerRef={frameRef}
              position="bottom-start"
              positionFromPoint={tooltipPos}
              onClose={() => setSelected(null)}
              gapX={10}
              gapY={12}
            >
              <div className={tooltipStyles}>
                <div>Node {selected.id}</div>
                <div>
                  ({selected.x.toFixed(1)}, {selected.y.toFixed(1)})
                </div>
              </div>
            </Popover>
          ) : null}
        </>
      ) : (
        <span className={centreStyles}>
          <LoadingSpinner size="md" />
          Loading ~200k nodes…
        </span>
      )}
    </div>
  );
};
