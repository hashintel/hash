import {
  CircleNodesLightIcon,
  ListRegularIcon,
} from "@hashintel/design-system";

import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { GridSolidIcon } from "../../shared/icons/grid-solid-icon";

import type { SvgIconProps } from "@mui/material";
import type { ReactElement } from "react";

/**
 * `NetworkGraph` is the new Atlas-tiled graph view. It sits alongside the
 * existing `Graph` view during the transition and will eventually replace it.
 */
export type VisualizerView = "Table" | "Graph" | "Grid" | "NetworkGraph";

export const visualizerViewIcons: Record<
  VisualizerView,
  ReactElement<SvgIconProps>
> = {
  Table: (
    <ListRegularIcon
      sx={{
        fontSize: 18,
      }}
    />
  ),
  Graph: (
    <ChartNetworkRegularIcon
      sx={{
        fontSize: 18,
      }}
    />
  ),
  Grid: (
    <GridSolidIcon
      sx={{
        fontSize: 14,
      }}
    />
  ),
  NetworkGraph: (
    <CircleNodesLightIcon
      sx={{
        fontSize: 18,
      }}
    />
  ),
};

export const visualizerViewLabels: Record<VisualizerView, string> = {
  Table: "Table view",
  Graph: "Graph view",
  Grid: "Grid view",
  NetworkGraph: "Graph view",
};
