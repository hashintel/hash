import { IconButton } from "@hashintel/design-system";
import { Box, Stack, type Theme, Tooltip, Typography } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";
import type { PropsWithChildren, ReactElement } from "react";

import { ArrowRightToLineIcon } from "../../../../../shared/icons/arrow-right-to-line-icon";
import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";

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
  fontSize = 11,
  tooltip,
}: PropsWithChildren<{
  fontSize?: number;
  tooltip: string | ReactElement;
}>) => (
  <Stack alignItems="center" direction="row" gap={0.5}>
    <Typography
      component="div"
      sx={{
        color: ({ palette }) => palette.gray[80],
        fontSize,
        fontWeight: 600,
        letterSpacing: 0.2,
      }}
      variant="smallCaps"
    >
      {children}
    </Typography>
    <InfoIconTooltip tooltip={tooltip} />
  </Stack>
);

export const ControlSectionContainer = ({
  children,
  label,
  tooltip,
}: PropsWithChildren<{ label: string; tooltip: string }>) => {
  return (
    <Stack
      gap={0.5}
      sx={{
        flex: 1,
        mx: 1,
        mt: 1.5,
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
        borderRadius: 2,
        px: 1.5,
        py: 1,
      }}
    >
      <ItemLabel fontSize={12} tooltip={tooltip}>
        {label}
      </ItemLabel>
      <Stack gap={1.2}>{children}</Stack>
    </Stack>
  );
};

export const ControlPanel = ({
  children,
  onClose,
  open,
  position,
  title,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  position: "left" | "right";
  title: string;
}>) => {
  return (
    <Box
      sx={{
        zIndex: 1,
        position: "absolute",
        left: position === "left" ? 0 : undefined,
        right: position === "right" ? 0 : undefined,
        top: 0,
        transform: open
          ? "translateX(0%)"
          : `translateX(${position === "left" ? "-" : ""}100%)`,
        maxHeight: ({ spacing }) => `calc(100% - ${spacing(4)})`,
        transition: ({ transitions }) => transitions.create(["transform"]),
        py: 1.2,
        background: ({ palette }) => palette.white,
        borderWidth: 1,
        borderColor: ({ palette }) => palette.gray[20],
        borderStyle: "solid",
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderLeftWidth: 1,
        borderBottomLeftRadius: 4,
        boxShadow: open ? ({ boxShadows }) => boxShadows.sm : undefined,
        minWidth: 180,
        overflowY: "auto",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        pr={1.8}
        pl={2}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[90],
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {title}
        </Typography>
        <IconButton
          onClick={() => onClose()}
          sx={{
            padding: 0.5,
            svg: {
              fontSize: 16,
              color: ({ palette }) => palette.gray[50],
            },
            transform: position === "left" ? undefined : "rotate(180deg)",
          }}
        >
          <ArrowRightToLineIcon />
        </IconButton>
      </Stack>
      {children}
    </Box>
  );
};
export const controlButtonSx: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  background: palette.common.white,
  borderColor: palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  borderRadius: "4px",
  p: 0.6,
  transition: "none",
});
