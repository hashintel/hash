import type { BoxProps } from "@mui/material";
import { Box, chipClasses } from "@mui/material";
import type { ReactNode } from "react";
import { Children, forwardRef } from "react";

type ChipGroupProps = {
  children: ReactNode;
} & BoxProps;

// @todo consider adding size as a prop to ChipGroup
// which can then be passed down to the child Chip components
// <ChipGroup size="xs">
//    <Chip />
//    <Chip />
// </ChipGroup>
//

export const ChipGroup = forwardRef<HTMLDivElement, ChipGroupProps>(
  ({ children }, ref) => {
    return (
      <Box
        ref={ref}
        sx={({ palette }) => ({
          display: "flex",
          // Don't remove the radius if there's
          // only 1 child
          // i.e this scenario =>
          // <ChipGroup>
          //   <Chip />
          // </ChipGroup>
          ...(Children.count(children) > 0 && {
            [` .${chipClasses.root}`]: {
              "&:not(:last-of-type)": {
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: `2px solid ${palette.white}`,
              },
              "&:not(:first-of-type)": {
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              },
            },
          }),
        })}
      >
        {children}
      </Box>
    );
  },
);
