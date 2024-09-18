import "@react-sigma/core/lib/react-sigma.min.css";

import { MultiDirectedGraph } from "graphology";
import dynamic from "next/dynamic";
import { memo, useState } from "react";

import type { TypesGraphProps } from "./types-graph/graph-loader";
import {
  FullScreenContextProvider,
  useFullScreen,
} from "./types-graph/shared/full-screen";

const Graph = ({
  height,
  onTypeClick,
  types,
}: Omit<TypesGraphProps, "highlightDepth"> & { height: string | number }) => {
  const [highlightDepth, setHighlightDepth] = useState(2);

  const SigmaContainer = dynamic(
    import("@react-sigma/core").then((module) => module.SigmaContainer),
    { ssr: false },
  );

  const TypesGraphLoader = dynamic(
    import("./types-graph/graph-loader").then((module) => module.GraphLoader),
    { ssr: false },
  );

  const FullScreenButton = dynamic(
    import("./types-graph/full-screen-button").then(
      (module) => module.FullScreenButton,
    ),
    { ssr: false },
  );

  const { isFullScreen } = useFullScreen();

  return (
    <SigmaContainer
      graph={MultiDirectedGraph}
      style={{ height: isFullScreen ? "100vh" : height }}
    >
      <FullScreenButton />
      <TypesGraphLoader
        highlightDepth={highlightDepth}
        onTypeClick={onTypeClick}
        types={types}
      />
    </SigmaContainer>
  );
};

export const TypesGraph = memo(
  ({
    height,
    onTypeClick,
    types,
  }: Omit<TypesGraphProps, "highlightDepth"> & { height: string | number }) => {
    /**
     * WebGL APIs aren't available in the server, so we need to dynamically load any module which uses Sigma/graphology.
     */
    if (typeof window !== "undefined") {
      return (
        <FullScreenContextProvider>
          <Graph height={height} onTypeClick={onTypeClick} types={types} />
        </FullScreenContextProvider>
      );
    }

    return null;
  },
);
