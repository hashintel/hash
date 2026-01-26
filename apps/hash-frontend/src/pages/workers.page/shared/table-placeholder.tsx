import {
  TableBody as MuiTableBody,
  TableCell as MuiTableCell,
  TableRow as MuiTableRow,
} from "@mui/material";
import type { PropsWithChildren } from "react";

export const placeholderHeight = 200;

export const PlaceholderContainer = ({
  children,
  columnCount,
}: PropsWithChildren<{ columnCount: number }>) => (
  <MuiTableBody>
    <MuiTableRow>
      <MuiTableCell colSpan={columnCount} sx={{ height: placeholderHeight }}>
        {children}
      </MuiTableCell>
    </MuiTableRow>
  </MuiTableBody>
);
