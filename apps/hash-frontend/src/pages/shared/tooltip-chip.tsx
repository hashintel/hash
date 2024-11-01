import { Box, Typography } from "@mui/material";
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
      })}
    >
      {icon && (
        <Box
          sx={({ palette }) => ({
            color: palette.common.white,
            borderRight: `1px solid ${palette.gray[80]}`,
            pl: 1,
            pr: 0.8,
            py: 0.8,
            "& svg": {
              fill: palette.common.white,
            },
          })}
        >
          {icon}
        </Box>
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
