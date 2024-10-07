import { Box } from "@mui/material";
import { SigmaContainer } from "@react-sigma/core";
import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { memo, useRef, useState } from "react";
import { EdgeArrowProgram } from "sigma/rendering";

import { Config } from "./graph-container/config";
import { FullScreenButton } from "./graph-container/full-screen-button";
import type { GraphLoaderProps } from "./graph-container/graph-data-loader";
import { GraphDataLoader } from "./graph-container/graph-data-loader";
import { FullScreenContextProvider } from "./graph-container/shared/full-screen";

export type GraphContainerProps = Omit<GraphLoaderProps, "config">;

const borderRadii = {
  borderBottomLeftRadius: "8px",
  borderBottomRightRadius: "8px",
};

export const GraphContainer = memo(
  ({ edges, nodes, onEdgeClick, onNodeClick }: GraphContainerProps) => {
    const [config, setConfig] = useState<GraphLoaderProps["config"]>({
      /**
       * When a node is hovered or clicked, the depth around it to which other nodes will be highlighted
       */
      highlightDepth: 4,
      /**
       * When a node is hovered or clicked, the links from it that will be followed to highlight neighbors,
       * i.e. 'All', 'In'wards and 'Out'wards
       */
      highlightDirection: "All",
    });

    const containerRef = useRef<HTMLDivElement>(null);

    return (
      <FullScreenContextProvider>
        <Box
          ref={containerRef}
          sx={({ palette }) => ({
            border: `1px solid ${palette.gray[30]}`,
            borderTopWidth: 0,
            height: "100%",
            ...borderRadii,
          })}
        >
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
              edgeProgramClasses: {
                arrow: EdgeArrowProgram,
                curved: EdgeCurvedArrowProgram,
              },
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
            style={{ position: "relative", overflow: "hidden", ...borderRadii }}
          >
            <FullScreenButton />
            <Config
              containerRef={containerRef}
              config={config}
              setConfig={setConfig}
            />
            <GraphDataLoader
              config={config}
              nodes={nodes}
              edges={edges}
              onEdgeClick={onEdgeClick}
              onNodeClick={onNodeClick}
            />
          </SigmaContainer>
        </Box>
      </FullScreenContextProvider>
    );
  },
);
