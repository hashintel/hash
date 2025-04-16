import type { TooltipProps } from "@mui/material";
import { Tooltip as MuiTooltip } from "@mui/material";

import { useGraphContext } from "./graph-context";

export const GraphVizTooltip = ({ children, ...props }: TooltipProps) => {
  const { graphContainerRef } = useGraphContext();

  return (
    <MuiTooltip
      {...props}
      slotProps={{ popper: { container: graphContainerRef.current } }}
    >
      {children}
    </MuiTooltip>
  );
};
