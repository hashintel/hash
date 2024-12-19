import { IconButton } from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { PropsWithChildren, ReactElement, RefObject } from "react";

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
  fontSize = 13,
  tooltip,
  uppercase = false,
}: PropsWithChildren<{
  fontSize?: number;
  tooltip: string | ReactElement;
  uppercase?: boolean;
}>) => (
  <Stack alignItems="center" direction="row" gap={0.5}>
    <Typography
      component="div"
      sx={{
        color: ({ palette }) =>
          uppercase ? palette.gray[70] : palette.common.black,
        fontSize,
        fontWeight: uppercase ? 600 : 400,
        letterSpacing: uppercase ? 0.2 : 0,
        textTransform: uppercase ? "uppercase" : "none",
      }}
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
      gap={1}
      sx={{
        flex: 1,
        mx: 1,
        mt: 1.5,
        borderRadius: 2,
        px: 1,
        py: 1,
      }}
    >
      <ItemLabel fontSize={12} tooltip={tooltip} uppercase>
        {label}
      </ItemLabel>
      <Stack gap={1.5}>{children}</Stack>
    </Stack>
  );
};

export const ControlPanel = ({
  children,
  onClose,
  open,
  panelRef,
  position,
  title,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  position: "left" | "right";
  panelRef?: RefObject<HTMLDivElement | null>;
  title: string;
}>) => {
  return (
    <Box
      ref={panelRef}
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
