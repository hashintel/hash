import type { SvgIconProps, SxProps, Theme } from "@mui/material";
import { Box, Container, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

import type { Breadcrumb } from "../pages/shared/breadcrumbs";
import { TopContextBar } from "../pages/shared/top-context-bar";
import { BoltLightIcon } from "./icons/bolt-light-icon";

type WorkersHeaderProps = {
  crumbs: Breadcrumb[];
  title: {
    Icon: FunctionComponent<SvgIconProps>;
    iconSx?: SxProps<Theme>;
    text: string;
  };
  subtitle?: string;
};

export const WorkersHeader = ({
  crumbs,
  title,
  subtitle,
}: WorkersHeaderProps) => {
  return (
    <>
      <TopContextBar
        crumbs={[
          {
            href: "/workers",
            id: "workers",
            icon: <BoltLightIcon />,
            title: "Workers",
          },
          ...crumbs,
        ]}
        sx={({ palette }) => ({
          background: palette.gray[5],
          borderBottom: `1px solid ${palette.gray[20]}`,
        })}
      />
      <Box
        sx={{
          my: 4.5,
          pb: 4.5,
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
        }}
      >
        <Container>
          <Box ml={4}>
            <Stack alignItems="center" direction="row" gap={1.5}>
              <title.Icon
                sx={[
                  {
                    fill: ({ palette }) => palette.blue[70],
                    fontSize: 39,
                  },
                  ...(Array.isArray(title.iconSx)
                    ? title.iconSx
                    : [title.iconSx]),
                ]}
              />
              <Typography variant="h3" sx={{ fontSize: 26, fontWeight: 400 }}>
                {title.text}
              </Typography>
            </Stack>
            {subtitle && (
              <Typography
                component="p"
                variant="largeTextLabels"
                sx={{ mt: 1, color: ({ palette }) => palette.gray[80] }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Container>
      </Box>
    </>
  );
};
