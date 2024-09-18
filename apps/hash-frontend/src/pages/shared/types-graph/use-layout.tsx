import { useSigma } from "@react-sigma/core";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useCallback } from "react";

export const useLayout = () => {
  const sigma = useSigma();

  const layout = useCallback(() => {
    const graph = sigma.getGraph();

    const settings = forceAtlas2.inferSettings(graph);

    forceAtlas2.assign(sigma.getGraph(), {
      iterations: 20,
      settings: {
        ...settings,
        gravity: 1,
      },
    });
  }, [sigma]);

  return layout;
};
