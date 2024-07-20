import type { FunctionComponent, ReactElement } from "react";
import { faAngleRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type {
  Box,
  Container,
  Stack,
  SvgIconProps,
  SxProps,
  Theme,
  Typography,
} from "@mui/material";

import type { Breadcrumb } from "../pages/shared/breadcrumbs";
import { TopContextBar } from "../pages/shared/top-context-bar";

import { BoltLightIcon } from "./icons/bolt-light-icon";

interface WorkersHeaderProps {
  endElement?: ReactElement;
  crumbs: Breadcrumb[];
  hideDivider?: boolean;
  title: {
    Icon: FunctionComponent<SvgIconProps>;
    iconSx?: SxProps<Theme>;
    text: string;
  };
  sideTitle?: string;
  subtitle?: string;
}

export const WorkersHeader = ({
  crumbs,
  endElement,
  hideDivider,
  sideTitle,
  subtitle,
  title,
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
          pb: hideDivider ? 1 : 4.5,
          borderBottom: ({ palette }) =>
            hideDivider ? undefined : `1px solid ${palette.gray[20]}`,
        }}
      >
        <Container>
          <Box ml={4}>
            <Stack
              alignItems={"center"}
              direction={"row"}
              justifyContent={"space-between"}
              sx={{ mb: 1.5 }}
            >
              <Stack alignItems={"center"} direction={"row"} gap={1.5}>
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
                <Typography
                  variant={"h3"}
                  sx={{ fontSize: 26, fontWeight: 400 }}
                >
                  {title.text}
                </Typography>
                {sideTitle ? (
                  <>
                    <FontAwesomeIcon
                      icon={faAngleRight}
                      sx={({ palette }) => ({
                        fontSize: 16,
                        color: palette.gray[50],
                        mx: 0,
                      })}
                    />
                    <Typography
                      variant={"h4"}
                      sx={{
                        color: ({ palette }) => palette.gray[80],
                        fontSize: 26,
                        fontWeight: 400,
                      }}
                    >
                      {sideTitle}
                    </Typography>
                  </>
                ) : null}
              </Stack>
              {endElement}
            </Stack>

            {subtitle && (
              <Typography
                component={"p"}
                variant={"largeTextLabels"}
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
