import { ListRegularIcon } from "@hashintel/design-system";
import type { SvgIconProps } from "@mui/material";
import type { ReactElement } from "react";

import { ChartNetworkRegularIcon } from "../../shared/icons/chart-network-regular-icon";
import { GridSolidIcon } from "../../shared/icons/grid-solid-icon";

const tableViews = ["Table", "Graph", "Grid"] as const;

export type TableView = (typeof tableViews)[number];

export const tableViewIcons: Record<TableView, ReactElement<SvgIconProps>> = {
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
