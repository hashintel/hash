import { TableCell, TableCellProps, Typography } from "@mui/material";
import { ReactNode } from "react";

export const Cell = ({
  children,
  ...props
}: TableCellProps & { children?: ReactNode }) => (
  <TableCell {...props}>
    {children ? (
      <Typography variant="smallTextParagraphs" fontWeight={600}>
        {children}
      </Typography>
    ) : null}
  </TableCell>
);
