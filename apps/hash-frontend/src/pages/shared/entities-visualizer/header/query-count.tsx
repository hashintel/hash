import { Box, useTheme } from "@mui/material";

import { LoadingSpinner } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import type { FunctionComponent } from "react";

interface QueryCountProps {
  /** Total entities in the displayed set. */
  readonly count: number | null | undefined;
  /**
   * How many of those are loaded client-side. When it trails the total, the
   * count reads "m of n entities" so partial loading is visible; equal (or
   * unknown) collapses to "n entities".
   */
  readonly loadedCount?: number | null;
  readonly loading: boolean;
}

export const QueryCount: FunctionComponent<QueryCountProps> = ({
  count,
  loadedCount,
  loading,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        color: ({ palette }) => palette.gray[70],
        fontSize: 13,
        fontWeight: 500,
        justifyContent: "flex-end",
        whiteSpace: "nowrap",
      }}
    >
      {loading ? (
        <>
          <LoadingSpinner size={14} color={theme.palette.blue[70]} />
          <span>Loading</span>
        </>
      ) : count != null ? (
        `${
          loadedCount != null && loadedCount < count
            ? `${formatNumber(loadedCount)} of `
            : ""
        }${formatNumber(count)} ${count === 1 ? "entity" : "entities"}`
      ) : (
        ""
      )}
    </Box>
  );
};
