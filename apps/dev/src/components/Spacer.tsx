import { Box } from "@mui/material";
import { VFC } from "react";

export const Spacer: VFC<
  | {
      x?: number;
      y?: number;
      basis?: number;
      flex?: undefined;
    }
  | { x?: undefined; y?: undefined; basis?: undefined; flex: true }
> = ({ x, y, flex, basis }) => (
  <Box
    data-testid="Spacer"
    sx={
      flex
        ? { flex: 1 }
        : {
            width: (theme) => (x ? theme.spacing(x) : undefined),
            height: (theme) => (y ? theme.spacing(y) : undefined),
            flexBasis: (theme) => (basis ? theme.spacing(basis) : undefined),
            flexGrow: 0,
            flexShrink: 0,
          }
    }
  />
);
