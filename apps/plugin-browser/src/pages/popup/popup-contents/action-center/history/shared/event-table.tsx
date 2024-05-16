import type { TableProps } from "@mui/material";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

const borderRadius = "8px";

export const EventTable = ({
  sx,
  children,
  triggerRow,
  ...tableProps
}: TableProps & { triggerRow: boolean }) => (
  <TableContainer
    sx={({ palette }) => ({
      border: `1px solid ${palette.gray[30]}`,
      borderRadius,
      maxHeight: 350,
      "@media (prefers-color-scheme: dark)": {
        border: `1px solid ${palette.gray[80]}`,
      },
    })}
  >
    <Table
      stickyHeader
      sx={[
        ({ palette }) => ({
          borderRadius,
          borderCollapse: "separate",
          "@media (prefers-color-scheme: dark)": {
            background: palette.common.black,
          },
          "th, td": {
            border: "none",
            color: palette.common.black,
            "@media (prefers-color-scheme: dark)": {
              color: palette.gray[30],
            },
            fontSize: 13,
            lineHeight: 1,
            padding: "10px 12px",
            "&:not(:last-of-type)": {
              borderRight: `1px solid ${palette.gray[30]}`,
              "@media (prefers-color-scheme: dark)": {
                borderRightColor: palette.gray[80],
              },
            },
          },
          th: {
            background: "rgba(242, 245, 250, 1)",
            borderBottom: "none",
            fontWeight: 600,
            "@media (prefers-color-scheme: dark)": {
              background: palette.gray[90],
            },
          },
          "tr:not(:last-of-type) td": {
            borderTop: `1px solid ${palette.gray[30]}`,
            "@media (prefers-color-scheme: dark)": {
              borderTopColor: palette.gray[80],
            },
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
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- @todo why is this any
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
  </TableContainer>
);
