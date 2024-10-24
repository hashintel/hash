import { GearIcon } from "@hashintel/block-design-system";
import { IconButton, Select } from "@hashintel/design-system";
import { Box } from "@mui/material";
import type { FunctionComponent } from "react";

import { MenuItem } from "../../../../../shared/ui/menu-item";
import {
  controlButtonSx,
  ControlPanel,
  ControlSectionContainer,
  ItemLabel,
} from "./control-components";
import { useGraphContext } from "./graph-context";
import { IntegerInput } from "./integer-input";
import { selectSx } from "./styles";

const directionOptions = ["All", "In", "Out"] as const;

type Direction = (typeof directionOptions)[number];

const scaleOptions = [
  "Geometric",
  "Linear",
  "Logarithmic",
  "Percentile",
] as const;

type Scale = (typeof scaleOptions)[number];

export type DynamicNodeSizing = {
  mode: "byEdgeCount";
  /**
   * The minimum size of a node.
   * Nodes will default to this size.
   * Nodes with the lowest number of relevant edges will be this size.
   */
  min: number;
  /**
   * The maximum size of a node.
   * The node with the greatest number of relevant edges will be this size.
   */
  max: number;
  /**
   * Which edges to count when determining node size.
   */
  countEdges: Direction;
  /**
   * Whether to scale node sizes linearly or logarithmically based on their edge count within the range of edge counts.
   * Logarithmic and geometric scaling is useful if there are outliers with high edge counts that dominate the range.
   * Geometric is less aggressive in compressing the range than logarithmic.
   */
  scale: Scale;
};

export type DynamicEdgeSizing = {
  /**
   * The minimum size of an edge.
   * Edges will default to this size.
   * Edges with the lowest weight will be this size.
   */
  min: number;
  /**
   * The maximum size of an edge.
   * The edge with the greatest weight will be this size.
   */
  max: number;
  /**
   * The size threshold below which edges will not be shown unless they are part of a highlighted graph,
   * i.e. after the user clicks on or hovers over a node.
   */
  nonHighlightedVisibleSizeThreshold: number;
  scale: Exclude<Scale, "Logarithmic" | "Percentile">;
};

export type StaticNodeSizing = {
  /**
   * Don't adjust node sizes – the parent component calling GraphVisualizer is responsible for setting them.
   */
  mode: "static";
};

export type GraphVizConfig<
  NodeSizing extends DynamicNodeSizing | StaticNodeSizing,
> = {
  edgeSizing: DynamicEdgeSizing;
  /**
   * A unique key for the graph, under which the viz settings will be stored in local storage.
   */
  graphKey: string;
  nodeHighlighting: {
    /**
     * When a node is hovered or clicked, the depth around it to which other nodes will be highlighted
     */
    depth: number;
    /**
     * When a node is hovered or clicked, the links from it that will be followed to highlight neighbors,
     * i.e. 'All', 'In'wards and 'Out'wards
     */
    direction: Direction;
  };
  nodeSizing: NodeSizing;
  pathfinding?: {
    startTypeId?: string;
    endTypeId?: string;
  };
};

const DirectionSelect = ({
  value,
  setValue,
}: {
  value: Direction;
  setValue: (value: Direction) => void;
}) => {
  /**
   * We need the ref of the container so that the MUI Select can be told where to render its popup dropdown into.
   * In full-screen mode, only part of the DOM is rendered, and we need MUI to render into the correct part,
   * rather than attaching its dropdown to the body. If we don't do this the popup won't show properly in fullscreen.
   */
  const { graphContainerRef } = useGraphContext();

  return (
    <Select
      value={value}
      onChange={(event) => setValue(event.target.value as Direction)}
      MenuProps={{
        container: graphContainerRef.current,
      }}
      sx={selectSx}
    >
      {directionOptions.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </Select>
  );
};

const ScaleSelect = <Exclusions extends Scale | null = null>({
  exclude,
  value,
  setValue,
}: {
  exclude?: Exclusions[];
  value: Exclude<Scale, Exclusions>;
  setValue: (value: Exclude<Scale, Exclusions>) => void;
}) => {
  /**
   * We need the ref of the container so that the MUI Select can be told where to render its popup dropdown into.
   * In full-screen mode, only part of the DOM is rendered, and we need MUI to render into the correct part,
   * rather than attaching its dropdown to the body. If we don't do this the popup won't show properly in fullscreen.
   */
  const { graphContainerRef } = useGraphContext();

  return (
    <Select
      value={value}
      onChange={(event) =>
        setValue(event.target.value as Exclude<Scale, Exclusions>)
      }
      MenuProps={{
        container: graphContainerRef.current,
      }}
      sx={selectSx}
    >
      {scaleOptions
        .filter((option) => !exclude || !exclude.includes(option as Exclusions))
        .map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
    </Select>
  );
};

const ConfigPanel: FunctionComponent<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { config, setConfig } = useGraphContext();

  return (
    <ControlPanel
      onClose={onClose}
      open={open}
      position="right"
      title="Configuration"
    >
      <ControlSectionContainer
        label="Highlights"
        tooltip="When you hover or click on a node, configure which connected nodes are also shown"
      >
        <Box>
          <ItemLabel tooltip="How far from the starting node to highlight. 1 means only immediately connected nodes will be highlighted, 2 includes nodes that those connect to, and so on.">
            Depth
          </ItemLabel>
          <IntegerInput
            value={config.nodeHighlighting.depth}
            setValue={(newDepth) => {
              setConfig({
                ...config,
                nodeHighlighting: {
                  ...config.nodeHighlighting,
                  depth: newDepth,
                },
              });
            }}
          />
        </Box>
        <Box>
          <ItemLabel tooltip="Whether to follow incoming links, outgoing links, or all links when deciding which connected nodes to visit">
            Direction
          </ItemLabel>
          <DirectionSelect
            value={config.nodeHighlighting.direction}
            setValue={(newDirection) =>
              setConfig({
                ...config,
                nodeHighlighting: {
                  ...config.nodeHighlighting,
                  direction: newDirection,
                },
              })
            }
          />
        </Box>
      </ControlSectionContainer>
      {config.nodeSizing.mode === "byEdgeCount" && (
        <>
          <ControlSectionContainer
            label="Node sizing"
            tooltip="Control the size of nodes in the graph, which is based on the number of links to and/or from other nodes they have."
          >
            <Box>
              <ItemLabel tooltip="The minimum size. Nodes will default to this size.">
                Min
              </ItemLabel>
              <IntegerInput
                value={config.nodeSizing.min}
                setValue={(newMin) =>
                  setConfig({
                    ...config,
                    nodeSizing: {
                      ...(config.nodeSizing as DynamicNodeSizing),
                      min: newMin,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel tooltip="The maximum size.">Max</ItemLabel>
              <IntegerInput
                value={config.nodeSizing.max}
                setValue={(newMax) =>
                  setConfig({
                    ...config,
                    nodeSizing: {
                      ...(config.nodeSizing as DynamicNodeSizing),
                      max: newMax,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel tooltip="Whether to count incoming links, outgoing links, or all links to/from a node when deciding its size.">
                Count edges
              </ItemLabel>
              <DirectionSelect
                value={config.nodeSizing.countEdges}
                setValue={(newDirection) =>
                  setConfig({
                    ...config,
                    nodeSizing: {
                      ...(config.nodeSizing as DynamicNodeSizing),
                      countEdges: newDirection,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel
                tooltip={
                  <Box>
                    <Box>How to scale node size:</Box>
                    <Box my={1}>
                      <strong>Linear</strong> means that a node with twice as
                      many edges as another will be roughly twice as big. If
                      there is an outlier node with a much higher edge count
                      than most of the others, it will be very large and the
                      rest will appear almost equally small, even if there are
                      significant differences in edge count between those rest.
                    </Box>
                    <Box my={1}>
                      <strong>Geometric</strong> smooths out differences between
                      nodes more so that nodes with much higher edge counts
                      don't dominate as much, while still being easily
                      distinguishable. Medium count nodes will be closer in size
                      to the larger ones than in a linear scale.
                    </Box>
                    <Box>
                      <strong>Logarithmic</strong> means that node size grows
                      quickly at low edge counts and slows down at higher edge
                      counts. It is the most aggressive in reducing the size
                      difference for nodes with the largest edge counts.
                    </Box>
                    <Box my={1}>
                      <strong>Percentile</strong> arranges nodes into buckets of
                      10% by edge count, and then increments each bucket by
                      1/10th of the difference between the min and max sizes. It
                      ensures an even distribution of node sizes, although it
                      means that nodes with little to no difference in edge
                      count can appear significantly different in size,
                      depending on the range of edge counts present in the
                      graph.
                    </Box>
                  </Box>
                }
              >
                Scaling
              </ItemLabel>
              <ScaleSelect
                value={config.nodeSizing.scale}
                setValue={(newScale) =>
                  setConfig({
                    ...config,
                    nodeSizing: {
                      ...(config.nodeSizing as DynamicNodeSizing),
                      scale: newScale,
                    },
                  })
                }
              />
            </Box>
          </ControlSectionContainer>
          <ControlSectionContainer
            label="Edge sizing"
            tooltip="Control the size of edges in the graph, which is based on the number of edges of the same type between the same two nodes."
          >
            <Box>
              <ItemLabel tooltip="The minimum size. Edge will default to this size.">
                Min
              </ItemLabel>
              <IntegerInput
                value={config.edgeSizing.min}
                setValue={(newMin) =>
                  setConfig({
                    ...config,
                    edgeSizing: {
                      ...config.edgeSizing,
                      min: newMin,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel tooltip="The maximum size.">Max</ItemLabel>
              <IntegerInput
                value={config.edgeSizing.max}
                setValue={(newMax) =>
                  setConfig({
                    ...config,
                    edgeSizing: {
                      ...config.edgeSizing,
                      max: newMax,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel tooltip="The minimum size of an edge for it to be visible without any specific nodes or paths highlighted">
                Visible min
              </ItemLabel>
              <IntegerInput
                max={config.edgeSizing.max}
                min={config.edgeSizing.min}
                value={config.edgeSizing.nonHighlightedVisibleSizeThreshold}
                setValue={(newVisibleMin) =>
                  setConfig({
                    ...config,
                    edgeSizing: {
                      ...config.edgeSizing,
                      nonHighlightedVisibleSizeThreshold: newVisibleMin,
                    },
                  })
                }
              />
            </Box>
            <Box>
              <ItemLabel
                tooltip={
                  <Box>
                    <Box>How to scale edge size:</Box>
                    <Box my={1}>
                      <strong>Linear</strong> means that an edge which
                      aggregates together twice as many edges as another will be
                      roughly twice as big. If there is an outlier edge with a
                      much higher aggregated edge count than most of the others,
                      it will be very large and the rest will appear almost
                      equally small, even if there are significant differences
                      in count between those rest.
                    </Box>
                    <Box my={1}>
                      <strong>Geometric</strong> smooths out differences between
                      edges more so that edges which aggregate up more
                      individual edges don't dominate as much, while still being
                      easily distinguishable.
                    </Box>
                  </Box>
                }
              >
                Scaling
              </ItemLabel>
              <ScaleSelect
                exclude={["Logarithmic", "Percentile"] as const}
                value={config.edgeSizing.scale}
                setValue={(newScale) =>
                  setConfig({
                    ...config,
                    edgeSizing: {
                      ...config.edgeSizing,
                      scale: newScale,
                    },
                  })
                }
              />
            </Box>
          </ControlSectionContainer>
        </>
      )}
    </ControlPanel>
  );
};

export const ConfigControl = () => {
  const { configPanelOpen, setConfigPanelOpen } = useGraphContext();

  return (
    <>
      <ConfigPanel
        open={configPanelOpen}
        onClose={() => setConfigPanelOpen(false)}
      />
      <IconButton
        onClick={() => setConfigPanelOpen(true)}
        sx={[controlButtonSx, { position: "absolute", top: 8, right: 46 }]}
      >
        <GearIcon />
      </IconButton>
    </>
  );
};
