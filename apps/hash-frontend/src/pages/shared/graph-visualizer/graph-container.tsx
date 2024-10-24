import { Box, Stack, useTheme } from "@mui/material";
import { SigmaContainer } from "@react-sigma/core";
import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { memo, useMemo, useRef } from "react";
import { createNodeCompoundProgram, EdgeArrowProgram } from "sigma/rendering";
import { createNodeImageProgram } from "@sigma/node-image";

import type { GraphLoaderProps } from "./graph-container/graph-data-loader";
import { GraphDataLoader } from "./graph-container/graph-data-loader";
import { PathFinderControl } from "./graph-container/path-finder-control";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./graph-container/shared/config-control";
import { ConfigControl } from "./graph-container/shared/config-control";
import type { GraphVizFilters } from "./graph-container/shared/filter-control";
import { FilterControl } from "./graph-container/shared/filter-control";
import { FullScreenContextProvider } from "./graph-container/shared/full-screen-context";
import { GraphContextProvider } from "./graph-container/shared/graph-context";
import { SearchControl } from "./graph-container/search-control";
import { ZoomControl } from "./graph-container/zoom-control";
import { FullScreenButton } from "./graph-container/full-screen-button";

export type GraphContainerProps<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = Omit<GraphLoaderProps, "config"> & {
  defaultConfig: GraphVizConfig<NodeSizing>;
  defaultFilters?: GraphVizFilters;
  /**
   * When toggling fullscreen, whether:
   * 1. the whole document will be sent into fullscreen, or
   * 2. only the graph container will be sent into fullscreen
   *
   * The latter may be suitable when the graph is part of a larger layout.
   */
  fullScreenMode?: "document" | "element";
  onRender?: () => void;
};

const borderRadii = {
  borderBottomLeftRadius: "8px",
  borderBottomRightRadius: "8px",
};

const bordered = createNodeBorderProgram({
  borders: [
    {
      size: { value: 2, mode: "pixels" },
      color: { attribute: "borderColor" },
    },
    { size: { fill: true }, color: { attribute: "color" } },
  ],
});

const NodePictogramCustomProgram = createNodeImageProgram({
  padding: 0.35,
  drawingMode: "color",
  colorAttribute: "iconColor",
  objectFit: "contain",
});

const icon = createNodeCompoundProgram([bordered, NodePictogramCustomProgram]);

export const GraphContainer = memo(
  <NodeSizing extends DynamicNodeSizing | StaticNodeSizing>({
    defaultConfig,
    defaultFilters,
    edges,
    fullScreenMode,
    nodes,
    onEdgeClick,
    onNodeSecondClick,
    onRender,
  }: GraphContainerProps<NodeSizing>) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { palette } = useTheme();

    const settings = useMemo(
      () => ({
        /**
         * These are the settings that won't change in the lifetime of the graph
         * (unless code is changed to make onEdgeClick or palette dynamic).
         *
         * If you need to make some settings dependent on potentially fast-changing state (e.g. viz config),
         * put them in {@link useSetDrawSettings} and {@link useEventHandlers}.
         */
        defaultNodeType: "bordered",
        enableEdgeEvents: !!onEdgeClick,
        /**
         * Edge labels are only shown on hover, controlled in the event handlers.
         */
        edgeLabelColor: { color: "rgba(80, 80, 80, 1)" },
        edgeLabelFont: `"Inter", "Helvetica", "sans-serif"`,
        edgeLabelSize: 11,
        edgeLabelWeight: "600",
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
          bordered,
          icon,
        },
        renderEdgeLabels: true,
        zoomDuration: 0.05,
        zoomingRatio: 1.25,
        zIndex: true,
      }),
      [onEdgeClick, palette],
    );

    return (
      <FullScreenContextProvider fullScreenMode={fullScreenMode}>
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
              defaultFilters={defaultFilters}
              onEdgeClick={onEdgeClick}
              onNodeSecondClick={onNodeSecondClick}
              onRender={onRender}
            >
              <PathFinderControl nodes={nodes} />
              <SearchControl nodes={nodes} />
              <ConfigControl />
              <FilterControl nodes={nodes} />
              <Stack
                direction="row"
                gap={1}
                sx={{ position: "absolute", bottom: 8, right: 8 }}
              >
                <FullScreenButton />
                <ZoomControl />
              </Stack>
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
