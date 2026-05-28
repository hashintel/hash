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
      display="flex"
      alignItems="center"
      sx={{
        color: ({ palette }) => palette.gray[70],
        fontSize: 13,
        fontWeight: 500,
        minWidth: 24,
        justifyContent: "flex-end",
      }}
    >
      {loading ? (
        <LoadingSpinner size={14} color={theme.palette.blue[70]} />
      ) : count != null ? (
        formatNumber(count)
      ) : (
        "–"
      )}
    </Box>
  );
};
