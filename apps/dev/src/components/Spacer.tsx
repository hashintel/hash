import { Box, Breakpoint, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { VFC } from "react";

type FlexProps = { flex: true };
type InnerNotFlexProps = {
  x?: number;
  y?: number;
  basis?: number;
};

type NotFlexProps = InnerNotFlexProps & {
  [key in Breakpoint]?: InnerNotFlexProps;
};

type SpacerProps =
  | ({ [key in keyof FlexProps]?: undefined } & NotFlexProps)
  | ({ [key in keyof NotFlexProps]?: undefined } & FlexProps);

const spacerStyles = ({
  x,
  y,
  basis,
}: InnerNotFlexProps | void = {}): SystemStyleObject<Theme> => ({
  width: (theme) => (x ? theme.spacing(x) : undefined),
  height: (theme) => (y ? theme.spacing(y) : undefined),
  flexBasis: (theme) => (basis ? theme.spacing(basis) : undefined),
});

export const Spacer: VFC<SpacerProps> = ({
  x,
  y,
  flex,
  basis,
  xs,
  sm,
  md,
  lg,
  xl,
}) => (
  <Box
    data-testid="Spacer"
    sx={
      flex
        ? { flex: 1 }
        : [
            {
              ...spacerStyles({ x, y, basis }),
              flexGrow: 0,
              flexShrink: 0,
            },
            xs ? spacerStyles(xs) : {},
            sm ? spacerStyles(sm) : {},
            md ? spacerStyles(md) : {},
            lg ? spacerStyles(lg) : {},
            xl ? spacerStyles(xl) : {},
          ]
    }
  />
);
