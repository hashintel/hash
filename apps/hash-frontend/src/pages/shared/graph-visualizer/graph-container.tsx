import { Box, useTheme } from "@mui/material";
import { SigmaContainer } from "@react-sigma/core";
import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { memo, useMemo, useRef } from "react";
import { EdgeArrowProgram } from "sigma/rendering";

import { FullScreenButton } from "./graph-container/full-screen-button";
import type { GraphLoaderProps } from "./graph-container/graph-data-loader";
import { GraphDataLoader } from "./graph-container/graph-data-loader";
import type { GraphVizConfig } from "./graph-container/shared/config-control";
import { ConfigControl } from "./graph-container/shared/config-control";
import { FilterControl } from "./graph-container/shared/filter-control";
import { FullScreenContextProvider } from "./graph-container/shared/full-screen-context";
import { GraphContextProvider } from "./graph-container/shared/graph-context";

export type GraphContainerProps = Omit<GraphLoaderProps, "config"> & {
  defaultConfig: GraphVizConfig;
  onRender: () => void;
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
    onRender,
  }: GraphContainerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { palette } = useTheme();

    const settings = useMemo(
      () => ({
        /**
         * These are the settings that won't change in the lifetime of the graph
         * (unless code is changed to make onEdgeClick or palette dynamic).
         *
         * the nodeProgramClasses setting in particular must not be recreated rapidly,
         * as it can cause a crash due to the program being absent,
         * Probably because it needs to call createNodeBorderProgram each time it's recreated
         * and recreating rapidly it might cause the program to be absent.
         *
         * If you need to make some settings dependent on potentially fast-changing state (e.g. viz config),
         * put them in {@link useSetDrawSettings} and {@link useEventHandlers}, or at least memoize nodeProgramClasses separately.
         */
        defaultNodeType: "bordered",
        enableEdgeEvents: !!onEdgeClick,
        /**
         * Edge labels are only shown on hover, controlled in the event handlers.
         */
        edgeLabelColor: { color: "rgba(80, 80, 80, 0.6)" },
        edgeLabelFont: `"Inter", "Helvetica", "sans-serif"`,
        edgeLabelSize: 10,
        edgeProgramClasses: {
          arrow: EdgeArrowProgram,
          curved: EdgeCurvedArrowProgram,
        },
        labelFont: `"Inter", "Helvetica", "sans-serif"`,
        labelSize: 12,
        labelColor: { color: palette.black },
        /**
         * Controls how many labels will be rendered in the given visible area.
         * Higher density = more labels
         *
         * Labels are prioritised for display by node size.
         */
        labelDensity: 1,
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
        zoomDuration: 0.05,
        zoomingRatio: 1.25,
        zIndex: true,
      }),
      [onEdgeClick, palette],
    );

    return (
      <FullScreenContextProvider>
        <Box
          ref={containerRef}
          sx={{
            border: `1px solid ${palette.gray[30]}`,
            borderTopWidth: 0,
            height: "100%",
            ...borderRadii,
          }}
        >
          <SigmaContainer
            graph={MultiDirectedGraph}
            settings={settings}
            style={{
              position: "relative",
              overflow: "hidden",
              ...borderRadii,
            }}
          >
            <GraphContextProvider
              graphContainerRef={containerRef}
              defaultConfig={defaultConfig}
              onEdgeClick={onEdgeClick}
              onNodeSecondClick={onNodeSecondClick}
              onRender={onRender}
            >
              {/*<FullScreenButton />*/}
              <ConfigControl />
              <FilterControl nodes={nodes} />
              <GraphDataLoader
                nodes={nodes}
                edges={edges}
                onEdgeClick={onEdgeClick}
                onNodeSecondClick={onNodeSecondClick}
              />
            </GraphContextProvider>
          </SigmaContainer>
        </Box>
      </FullScreenContextProvider>
    );
  },
);
