import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LoadingSpinner } from "../Loading/loading-spinner";
// Imported with `?url` so the ~23 MB of fixtures are served as static assets
// and parsed at runtime, rather than inlined into the story bundle.
import edgesUrl from "./edges.json?url";
import {
  GraphChart,
  type GraphChartEdge,
  type GraphChartPoint,
  type GraphChartProps,
} from "./graph-chart";
import pointsUrl from "./points.json?url";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/GraphChart",
  argTypes: {},
  args: {},
} satisfies StoryDefault<GraphChartProps>;

interface GraphData {
  points: GraphChartPoint[];
  edges: GraphChartEdge[];
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
          (response) => response.json() as Promise<GraphChartPoint[]>,
        ),
        fetch(edgesUrl).then(
          (response) => response.json() as Promise<GraphChartEdge[]>,
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

const hintStyles = css({
  position: "absolute",
  top: "3",
  left: "3",
  zIndex: "[1]",
  paddingX: "4",
  paddingY: "3",
  borderRadius: "sm",
  backgroundColor: "[rgba(255, 255, 255, 0.85)]",
  color: "neutral.s70",
  fontSize: "xs",
  pointerEvents: "none",
  userSelect: "none",
});

/**
 * A 200k-node / 300k-edge scatterplot rendered with deck.gl. Edges are hidden
 * by default; hover a node to reveal its connections and neighbours. Scroll to
 * zoom and drag to pan.
 */
export const Default: Story<GraphChartProps> = () => {
  const data = useGraphData();

  return (
    <div className={frameStyles}>
      {data ? (
        <>
          <span className={hintStyles}>
            Hover a node to reveal its connections · scroll to zoom · drag to
            pan
          </span>
          <GraphChart points={data.points} edges={data.edges} />
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
