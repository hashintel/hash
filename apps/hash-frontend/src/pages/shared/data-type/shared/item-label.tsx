import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { PropsWithChildren, ReactElement } from "react";

import { CircleInfoIcon } from "../../../../shared/icons/circle-info-icon";

export const InfoIconTooltip = ({
  tooltip,
}: {
  tooltip: string | ReactElement;
}) => {
  return (
    <Tooltip title={tooltip} placement="top">
      <Box
        sx={{
          display: "flex",
          color: ({ palette }) => palette.gray[50],
          fontSize: 10,
        }}
      >
        <CircleInfoIcon fontSize="inherit" />
      </Box>
    </Tooltip>
  );
};

export const ItemLabel = ({
  children,
  tooltip,
}: PropsWithChildren<{
  tooltip: string | ReactElement;
}>) => (
  <Stack alignItems="center" direction="row" gap={0.5}>
    <Typography
      component="div"
      sx={{
        color: ({ palette }) => palette.common.black,
        fontSize: 13,
        fontWeight: 400,
      }}
    >
      {children}
    </Typography>
    <InfoIconTooltip tooltip={tooltip} />
  </Stack>
);
