import { Grid, GridProps, useMediaQuery, useTheme } from "@mui/material";
import { FunctionComponent, PropsWithChildren, useMemo } from "react";

export const GridViewItemWrapper: FunctionComponent<
  {
    numberOfItems: number;
    index: number;
    sx?: GridProps["sx"];
  } & PropsWithChildren
> = ({ numberOfItems, index, children, sx }) => {
  const theme = useTheme();

  const isLg = useMediaQuery(theme.breakpoints.up("lg"));
  const isMd = useMediaQuery(theme.breakpoints.up("md"));

  const numberOfItemsPerRow = isLg ? 4 : isMd ? 3 : 2;

  const isInLastRow = useMemo(() => {
    const numberOfRows = Math.ceil(numberOfItems / numberOfItemsPerRow);
    const currentRowNumber = Math.floor(index / numberOfItemsPerRow) + 1;

    return currentRowNumber === numberOfRows;
  }, [numberOfItems, numberOfItemsPerRow, index]);

  const isLastInRow = (index + 1) % numberOfItemsPerRow === 0;
  return (
    <Grid
      item
      xs={6}
      md={4}
      lg={3}
      sx={[
        {
          background: ({ palette }) => palette.common.white,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderTopWidth: 0,
          borderRightWidth: isLastInRow ? 0 : 1,
          borderLeftWidth: 0,
          borderBottomWidth: isInLastRow ? 0 : 1,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Grid>
  );
};
