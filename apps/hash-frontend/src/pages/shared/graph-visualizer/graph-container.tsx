import { SigmaContainer } from "@react-sigma/core";
import { createNodeBorderProgram } from "@sigma/node-border";
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
          /**
           * @see {@link useDefaultSettings} for more settings
           */
          /**
           * These settings need to be set before the graph is rendered.
           */
          defaultNodeType: "bordered",
          nodeProgramClasses: {
            bordered: createNodeBorderProgram({
              borders: [
                {
                  size: { value: 2, mode: "pixels" },
                  color: { attribute: "borderColor" },
                },
                { size: { fill: true }, color: { attribute: "color" } },
              ],
            }),
          },
          /**
           * This setting is dependent on props, and is easiest to set here.
           */
          enableEdgeEvents: !!onEdgeClick,
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
