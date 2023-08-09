import { TableCell, Typography } from "@mui/material";

export const Cell = ({ children }: { children?: React.ReactNode }) => (
  <TableCell>
    {children ? (
      <Typography variant="smallTextParagraphs" fontWeight={600}>
        {children}
      </Typography>
    ) : null}
  </TableCell>
);
