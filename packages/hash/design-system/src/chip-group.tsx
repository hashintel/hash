import * as React from "react";
import { Box, chipClasses, BoxProps } from "@mui/material";

type ChipGroupProps = {
  children: React.ReactNode;
} & BoxProps;

// @todo consider adding size as a prop to ChipGroup
// which can then be passed down to the child Chip components
// <ChipGroup size="xs">
//    <Chip />
//    <Chip />
// </ChipGroup>
//

export const ChipGroup: FC<ChipGroupProps> = React.forwardRef(
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
          ...(React.Children.count(children) > 0 && {
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
