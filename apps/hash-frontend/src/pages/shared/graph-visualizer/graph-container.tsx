import { Box } from "@mui/material";
import { SigmaContainer } from "@react-sigma/core";
import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { memo, useMemo, useRef } from "react";
import { useLocalstorageState } from "rooks";
import { EdgeArrowProgram } from "sigma/rendering";

import type { GraphVizConfig } from "./graph-container/config";
import { Config } from "./graph-container/config";
import { FullScreenButton } from "./graph-container/full-screen-button";
import type { GraphLoaderProps } from "./graph-container/graph-data-loader";
import { GraphDataLoader } from "./graph-container/graph-data-loader";
import { FullScreenContextProvider } from "./graph-container/shared/full-screen";

export type GraphContainerProps = Omit<GraphLoaderProps, "config"> & {
  defaultConfig: GraphVizConfig;
};

const borderRadii = {
  borderBottomLeftRadius: "8px",
  borderBottomRightRadius: "8px",
};

export const GraphContainer = memo(
  ({
    defaultConfig,
    edges,
    nodes,
    onEdgeClick,
    onNodeSecondClick,
  }: GraphContainerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [config, setConfig] = useLocalstorageState<GraphVizConfig>(
      `graph-viz-config~${defaultConfig.graphKey}`,
      defaultConfig,
    );

    const settings = useMemo(
      () => ({
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
      }),
      [onEdgeClick],
    );

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
            settings={settings}
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
              onNodeSecondClick={onNodeSecondClick}
            />
          </SigmaContainer>
        </Box>
      </FullScreenContextProvider>
    );
  },
);
