import "@react-sigma/core/lib/react-sigma.min.css";

import { MultiDirectedGraph } from "graphology";
import dynamic from "next/dynamic";
import { memo, useState } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";

import type { TypesGraphProps } from "./types-graph/graph-loader";

export const TypesGraph = memo(
  ({
    height,
    onTypeClick,
    types,
  }: TypesGraphProps & { height: string | number }) => {
    const fullScreenHandle = useFullScreenHandle();

    const [highlightDepth, setHighlightDepth] = useState(2);

    /**
     * WebGL APIs aren't available in the server, so we need to dynamically load any module which uses Sigma/graphology.
     */
    if (typeof window !== "undefined") {
      const SigmaContainer = dynamic(
        import("@react-sigma/core").then((module) => module.SigmaContainer),
        { ssr: false },
      );

      const TypesGraphLoader = dynamic(
        import("./types-graph/graph-loader").then(
          (module) => module.GraphLoader,
        ),
        { ssr: false },
      );

      const FullScreenButton = dynamic(
        import("./types-graph/full-screen-button").then(
          (module) => module.FullScreenButton,
        ),
        { ssr: false },
      );

      return (
        <FullScreen handle={fullScreenHandle}>
          <SigmaContainer
            graph={MultiDirectedGraph}
            style={{ height: fullScreenHandle.active ? "100vh" : height }}
          >
            <FullScreenButton handle={fullScreenHandle} />
            <TypesGraphLoader
              highlightDepth={highlightDepth}
              onTypeClick={onTypeClick}
              types={types}
            />
          </SigmaContainer>
        </FullScreen>
      );
    }

    return null;
  },
);
