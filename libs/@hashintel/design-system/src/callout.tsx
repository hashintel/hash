import { Stack, Typography } from "@mui/material";

import { HashInlineIcon } from "./hash-svg-icon";

import type { SxProps, Theme } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";

const faCircleInfo = { icon: "info" } as const;
const faTriangleExclamation = { icon: "warning" } as const;
const faWarning = { icon: "warning" } as const;

type CalloutProps = {
  children: ReactNode;
  type: "info" | "warning" | "error";
  sx?: SxProps<Theme>;
};

export const Callout = ({
  children,
  type,
  sx,
}: PropsWithChildren<CalloutProps>) => {
  return (
    <Stack
      alignItems="center"
      direction="row"
      sx={[
        ({ palette }) => ({
          background:
            type === "warning"
              ? palette.yellow[20]
              : type === "error"
                ? palette.red[20]
                : palette.blue[20],
          borderY: `1px solid ${
            type === "warning"
              ? palette.yellow[40]
              : type === "error"
                ? palette.blue[30]
                : palette.blue[30]
          }`,
          px: 2.5,
          py: 2,
          width: "100%",
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <HashInlineIcon
        icon={
          type === "warning"
            ? faWarning
            : type === "error"
              ? faTriangleExclamation
              : faCircleInfo
        }
        sx={({ palette }) => ({
          color:
            type === "warning"
              ? palette.yellow[70]
              : type === "error"
                ? palette.red[70]
                : palette.blue[70],
          fontSize: 32,
          mr: 3,
        })}
      />
      <Typography
        variant="smallTextLabels"
        sx={({ palette }) => ({ color: palette.gray[80] })}
      >
        {children}
      </Typography>
    </Stack>
  );
};
