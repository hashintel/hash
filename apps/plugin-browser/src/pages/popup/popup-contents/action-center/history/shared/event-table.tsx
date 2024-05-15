import type { TableProps } from "@mui/material";
import {
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Table,
} from "@mui/material";
import { darkModeBorderColor } from "../../../../../shared/style-values";

const borderRadius = "8px";

export const EventTable = ({
  sx,
  children,
  triggerRow,
  ...tableProps
}: TableProps & { triggerRow: boolean }) => (
  <Table
    sx={[
      ({ palette }) => ({
        borderRadius,
        borderCollapse: "separate",
        border: `1px solid ${palette.gray[30]}`,
        "@media (prefers-color-scheme: dark)": {
          background: palette.common.black,
          border: `1px solid ${darkModeBorderColor}`,
        },
        "th, td": {
          color: palette.common.black,
          "@media (prefers-color-scheme: dark)": {
            color: palette.gray[30],
          },
          fontSize: 13,
          lineHeight: 1,
          padding: "10px 12px",
        },
        th: {
          background: palette.gray[20],
          fontWeight: 600,
          "@media (prefers-color-scheme: dark)": {
            background: palette.gray[90],
          },
        },
        "tr:not(:first-of-type)": {
          td: { borderBottom: `1px solid ${palette.gray[20]}` },
        },
        "thead tr": {
          "th:first-of-type": {
            borderTopLeftRadius: borderRadius,
          },
          "th:last-of-type": {
            borderTopRightRadius: borderRadius,
          },
        },
        "tbody tr:last-of-type": {
          "td:first-of-type": {
            borderBottomLeftRadius: borderRadius,
          },
          "td:last-of-type": {
            borderBottomRightRadius: borderRadius,
          },
        },
        "td:not(:last-of-type)": {
          borderRight: palette.gray[20],
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...tableProps}
  >
    <TableHead>
      <TableRow>
        <TableCell>Event</TableCell>
        <TableCell>Subject</TableCell>
        {triggerRow && <TableCell>Trigger</TableCell>}
        <TableCell>Status</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>{children}</TableBody>
  </Table>
);
