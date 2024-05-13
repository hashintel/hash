import type { SvgIconProps } from "@mui/material";
import { Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

export const EmptyOutputBox = ({
  label,
  Icon,
}: {
  label: string;
  Icon: FunctionComponent<SvgIconProps>;
}) => (
  <Stack
    alignItems="center"
    justifyContent="center"
    sx={{ height: "100%", p: 3 }}
  >
    <Icon
      sx={{
        color: ({ palette }) => palette.gray[40],
        height: 42,
        width: "auto",
        mb: 2,
      }}
    />
    <Typography
      sx={{
        color: ({ palette }) => palette.gray[60],
        fontSize: 14,
        fontWeight: 500,
        textAlign: "center",
      }}
    >
      {label}
    </Typography>
  </Stack>
);
