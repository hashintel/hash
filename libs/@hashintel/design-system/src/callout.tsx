import { faCircleInfo, faWarning } from "@fortawesome/free-solid-svg-icons";
import type { SxProps, Theme } from "@mui/material";
import { Stack, Typography } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";

import { FontAwesomeIcon } from "./fontawesome-icon";

type CalloutProps = {
  children: ReactNode;
  type: "info" | "warning";
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
            type === "warning" ? palette.yellow[20] : palette.blue[20],
          borderY: `1px solid ${
            type === "warning" ? palette.yellow[40] : palette.blue[30]
          }`,
          px: 2.5,
          py: 2,
          width: "100%",
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <FontAwesomeIcon
        icon={type === "warning" ? faWarning : faCircleInfo}
        sx={({ palette }) => ({
          color: type === "warning" ? palette.yellow[70] : palette.blue[70],
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
