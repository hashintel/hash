import { GearIcon } from "@hashintel/block-design-system";
import { IconButton, Select } from "@hashintel/design-system";
import { Box, outlinedInputClasses } from "@mui/material";
import type { FunctionComponent } from "react";

import { MenuItem } from "../../../../../shared/ui/menu-item";
import {
  controlButtonSx,
  ControlPanel,
  ControlSectionContainer,
  ItemLabel,
} from "./control-components";
import { useGraphContext } from "./graph-context";

type Direction = "All" | "In" | "Out";

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
      sx={{
        [`.${outlinedInputClasses.root} .${outlinedInputClasses.input}`]: {
          fontSize: 14,
          px: 1.5,
          py: 1,
        },
        [`.${outlinedInputClasses.root}`]: {
          boxShadow: "none",
        },
        width: "100%",
      }}
    >
      {["All", "In", "Out"].map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </Select>
  );
};

const IntegerInput = ({
  value,
  setValue,
}: {
  value: number;
  setValue: (value: number) => void;
}) => {
  return (
    <Box
      component="input"
      step={1}
      min={1}
      type="number"
      value={value.toString()}
      onChange={(event) => setValue(parseInt(event.target.value, 10))}
      sx={({ palette }) => ({
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 1,
        fontSize: 14,
        py: 1.2,
        px: 1.5,
        mt: 0.5,
      })}
    />
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
        <ControlSectionContainer
          label="Sizing"
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
        </ControlSectionContainer>
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
