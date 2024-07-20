import type { ReactNode } from "react";
import type { TableCell, TableCellProps, Typography } from "@mui/material";

export const Cell = ({
  children,
  ...props
}: TableCellProps & { children?: ReactNode }) => (
  <TableCell {...props}>
    {children ? (
      <Typography variant={"smallTextParagraphs"} fontWeight={600}>
        {children}
      </Typography>
    ) : null}
  </TableCell>
);
