import type { TableProps } from "@mui/material";
import { Table } from "@mui/material";

export const OrgTable = ({ sx, ...props }: TableProps) => (
  <Table
    sx={[
      ({ palette }) => ({
        borderRadius: 1,
        boxShadow: ({ boxShadows }) => boxShadows.xs,
        "th, td": {
          padding: "12px 16px",
          "&:first-of-type": {
            paddingLeft: "24px",
          },
          "&:last-of-type": {
            paddingRight: "24px",
          },
        },
        th: {
          borderBottom: `1px solid ${palette.gray[20]}`,
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);
