import { GearIcon } from "@hashintel/block-design-system";
import { IconButton, Select } from "@hashintel/design-system";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren, RefObject } from "react";
import { useRef, useState } from "react";

import { ArrowRightToLineIcon } from "../../../../shared/icons/arrow-right-to-line-icon";
import { MenuItem } from "../../../../shared/ui/menu-item";
import { buttonSx } from "./shared/button-styles";

type Direction = "All" | "In" | "Out";

type DynamicNodeSizing = {
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

type StaticNodeSizing = {
  /**
   * Don't adjust node sizes – the parent component calling GraphVisualizer is responsible for setting them.
   */
  mode: "static";
};

export type GraphVizConfig = {
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
  nodeSizing: DynamicNodeSizing | StaticNodeSizing;
  filters: {
    /**
     * Only show nodes with these `nodeTypeId`s
     * An empty or missing array will be treated as no type filter.
     */
    typeIds?: string[];
  };
};

const DirectionSelect = ({
  containerRef,
  value,
  setValue,
}: {
  containerRef: RefObject<HTMLDivElement>;
  value: Direction;
  setValue: (value: Direction) => void;
}) => {
  return (
    <Select
      value={value}
      onChange={(event) => setValue(event.target.value as Direction)}
      MenuProps={{
        container: containerRef.current,
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

const ItemLabel = ({ children }: PropsWithChildren) => (
  <Typography
    component="div"
    sx={{
      color: ({ palette }) => palette.gray[80],
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.2,
    }}
    variant="smallCaps"
  >
    {children}
  </Typography>
);

const ConfigSectionContainer = ({
  children,
  label,
}: PropsWithChildren<{ label: string }>) => {
  return (
    <Stack
      gap={0.5}
      sx={{
        mx: 1,
        mt: 1.5,
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
        borderRadius: 2,
        px: 1.5,
        py: 1,
      }}
    >
      <Typography mt={1.5} variant="smallCaps" sx={{ mt: 0, fontSize: 12 }}>
        {label}
      </Typography>
      <Stack gap={1.2}>{children}</Stack>
    </Stack>
  );
};

export const ConfigPanel: FunctionComponent<{
  containerRef: RefObject<HTMLDivElement>;
  config: GraphVizConfig;
  setConfig: (config: GraphVizConfig) => void;
  open: boolean;
  onClose: () => void;
}> = ({ containerRef, config, setConfig, open, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <Box
      ref={panelRef}
      sx={{
        zIndex: 1,
        position: "absolute",
        right: 0,
        top: 0,
        transform: open ? "translateX(0%)" : "translateX(100%)",
        maxHeight: ({ spacing }) => `calc(100% - ${spacing(4)})`,
        transition: ({ transitions }) => transitions.create(["transform"]),
        py: 1.2,
        background: ({ palette }) => palette.white,
        borderWidth: 1,
        borderColor: ({ palette }) => palette.gray[20],
        borderStyle: "solid",
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderLeftWidth: 1,
        borderBottomLeftRadius: 4,
        boxShadow: ({ boxShadows }) => boxShadows.sm,
        minWidth: 150,
        overflowY: "auto",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        pr={1.8}
        pl={2}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[90],
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Configuration
        </Typography>
        <IconButton
          onClick={() => onClose()}
          sx={{
            padding: 0.5,
            svg: {
              fontSize: 16,
              color: ({ palette }) => palette.gray[50],
            },
            transform: "rotate(180deg)",
          }}
        >
          <ArrowRightToLineIcon />
        </IconButton>
      </Stack>
      <Box>
        <ConfigSectionContainer label="Highlights">
          <Box>
            <ItemLabel>Depth</ItemLabel>
            <IntegerInput
              value={config.nodeHighlighting.depth}
              setValue={(newDepth) =>
                setConfig({
                  ...config,
                  nodeHighlighting: {
                    ...config.nodeHighlighting,
                    depth: newDepth,
                  },
                })
              }
            />
          </Box>
          <Box>
            <ItemLabel>Direction</ItemLabel>
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
              containerRef={containerRef}
            />
          </Box>
        </ConfigSectionContainer>
        {config.nodeSizing.mode === "byEdgeCount" && (
          <ConfigSectionContainer label="Sizing">
            <Box>
              <ItemLabel>Min</ItemLabel>
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
              <ItemLabel>Max</ItemLabel>
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
              <ItemLabel>Count edges</ItemLabel>
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
                containerRef={containerRef}
              />
            </Box>
          </ConfigSectionContainer>
        )}
      </Box>
    </Box>
  );
};

export const Config = ({
  containerRef,
  config,
  setConfig,
}: {
  containerRef: RefObject<HTMLDivElement>;
  config: GraphVizConfig;
  setConfig: (config: GraphVizConfig) => void;
}) => {
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  return (
    <>
      <ConfigPanel
        containerRef={containerRef}
        config={config}
        setConfig={setConfig}
        open={showConfigPanel}
        onClose={() => setShowConfigPanel(false)}
      />
      <IconButton
        onClick={() => setShowConfigPanel(true)}
        sx={[buttonSx, { top: 8, right: 13 }]}
      >
        <GearIcon />
      </IconButton>
    </>
  );
};
