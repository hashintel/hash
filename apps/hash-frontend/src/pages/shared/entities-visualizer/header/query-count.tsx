import { Box, useTheme } from "@mui/material";

import { LoadingSpinner } from "@hashintel/design-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import type { FunctionComponent } from "react";

type QueryCountProps = {
  count: number | null | undefined;
  loading: boolean;
};

export const QueryCount: FunctionComponent<QueryCountProps> = ({
  count,
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
      }}
    >
      {loading ? (
        <>
          <LoadingSpinner size={14} color={theme.palette.blue[70]} />
          <span>Loading</span>
        </>
      ) : count != null ? (
        `${formatNumber(count)} ${count === 1 ? "entity" : "entities"}`
      ) : (
        "–"
      )}
    </Box>
  );
};
