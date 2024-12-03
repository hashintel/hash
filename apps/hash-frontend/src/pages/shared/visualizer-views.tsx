import { ListRegularIcon } from "@hashintel/design-system";
import type { SvgIconProps } from "@mui/material";
import type { ReactElement } from "react";

import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { GridSolidIcon } from "../../shared/icons/grid-solid-icon";

const visualizerViews = ["Table", "Graph", "Grid"] as const;

export type VisualizerView = (typeof visualizerViews)[number];

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
};
