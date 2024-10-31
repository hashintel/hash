import { useSigma } from "@react-sigma/core";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { useCallback } from "react";

export const useLayout = () => {
  const sigma = useSigma();

  const layout = useCallback(() => {
    const graph = sigma.getGraph();

    /**
     * Generate some default settings based on the graph
     */
    const settings = forceAtlas2.inferSettings(graph);

    const forceAtlasLayout = new FA2Layout(graph, {
      /**
       * @see https://graphology.github.io/standard-library/layout-forceatlas2.html
       * @see https://observablehq.com/@mef/forceatlas2-layout-settings-visualized
       */
      settings: {
        ...settings,
        outboundAttractionDistribution: true,
        gravity: 2.5,
        scalingRatio: 10,
      },
    });

    forceAtlasLayout.start();

    setInterval(() => {
      /**
       * The layout process will stop automatically if the algorithm has converged, but this is not guaranteed to happen.
       * A few seconds seems sufficient for graphs of ~10k items (nodes and edges).
       */
      forceAtlasLayout.stop();
    }, 2_000);

    return () => {
      forceAtlasLayout.kill();
    };
  }, [sigma]);

  return layout;
};
