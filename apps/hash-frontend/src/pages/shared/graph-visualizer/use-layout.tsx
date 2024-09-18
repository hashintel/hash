import { useSigma } from "@react-sigma/core";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useCallback } from "react";

export const useLayout = () => {
  const sigma = useSigma();

  const layout = useCallback(() => {
    const graph = sigma.getGraph();

    /**
     * Generate some default settings based on the graph
     */
    const settings = forceAtlas2.inferSettings(graph);

    forceAtlas2.assign(sigma.getGraph(), {
      /**
       * How many iterations to run the layout algorithm for.
       */
      iterations: 20,
      /**
       * @see https://graphology.github.io/standard-library/layout-forceatlas2.html
       * @see https://observablehq.com/@mef/forceatlas2-layout-settings-visualized
       */
      settings: {
        ...settings,
        gravity: 1,
      },
    });
  }, [sigma]);

  return layout;
};
