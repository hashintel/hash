import { SigmaContainer } from "@react-sigma/core";
import { NodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { useState } from "react";

import { FullScreenButton } from "./graph-container/full-screen-button";
import type { GraphLoaderProps } from "./graph-container/graph-data-loader";
import { GraphDataLoader } from "./graph-container/graph-data-loader";
import { FullScreenContextProvider } from "./graph-container/shared/full-screen";

export type GraphContainerProps = Omit<GraphLoaderProps, "highlightDepth">;

export const GraphContainer = ({
  edges,
  nodes,
  onEdgeClick,
  onNodeClick,
}: GraphContainerProps) => {
  /**
   * When a node is hovered or selected, we highlight its neighbors up to this depth.
   *
   * Not currently exposed as a user setting but could be, thus the state.
   */
  const [highlightDepth, _setHighlightDepth] = useState(2);

  return (
    <FullScreenContextProvider>
      <SigmaContainer
        graph={MultiDirectedGraph}
        settings={{
          defaultNodeType: "bordered",
          nodeProgramClasses: {
            bordered: NodeBorderProgram,
          },
        }}
      >
        <FullScreenButton />
        <GraphDataLoader
          highlightDepth={highlightDepth}
          nodes={nodes}
          edges={edges}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
        />
      </SigmaContainer>
    </FullScreenContextProvider>
  );
};
