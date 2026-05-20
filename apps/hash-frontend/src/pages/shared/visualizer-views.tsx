import { ListRegularIcon } from "@hashintel/design-system";

import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { GridSolidIcon } from "../../shared/icons/grid-solid-icon";

import type { SvgIconProps } from "@mui/material";
import type { ReactElement } from "react";

export type VisualizerView = "Table" | "Graph" | "Grid";

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
