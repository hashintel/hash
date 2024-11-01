import { Box, Stack, Typography } from "@mui/material";
import type { ReactElement } from "react";

export const TooltipChip = ({
  icon,
  label,
  onClick,
}: {
  icon?: ReactElement;
  label: string;
  onClick?: () => void;
}) => {
  return (
    <Box
      onClick={onClick}
      sx={({ palette }) => ({
        alignItems: "center",
        display: "flex",
        background: palette.common.black,
        border: `1px solid ${palette.gray[80]}`,
        borderRadius: "30px",
        cursor: onClick ? "pointer" : "default",
        maxWidth: "100%",
        height: 24,
      })}
    >
      {icon && (
        <Stack
          justifyContent="center"
          sx={({ palette }) => ({
            color: palette.common.white,
            borderRight: `1px solid ${palette.gray[80]}`,
            pl: 1,
            pr: 0.8,
            height: "100%",
            "& svg": {
              fill: palette.common.white,
            },
          })}
        >
          {icon}
        </Stack>
      )}
      <Typography
        sx={{
          color: ({ palette }) => palette.common.white,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.1,
          px: 1,
          display: "block",
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
};
