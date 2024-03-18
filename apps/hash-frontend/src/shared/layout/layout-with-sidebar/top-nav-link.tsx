import type { BoxProps } from "@mui/material";
import {
  Box,
  Fade,
  Tooltip,
  Typography,
  typographyClasses,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { Link } from "../../ui";

type NavLinkProps = {
  title: string;
  href: string;
  icon?: ReactNode;
  count?: number;
  active?: boolean;
  tooltipTitle: string;
  sx?: BoxProps["sx"];
};

export const TopNavLink: FunctionComponent<NavLinkProps> = ({
  icon,
  title,
  href,
  active,
  count,
  tooltipTitle,
  sx,
}) => {
  return (
    <Tooltip title={tooltipTitle}>
      <Link
        href={href}
        noLinkStyle
        sx={[
          ({ palette, transitions, spacing }) => ({
            display: "flex",
            alignItems: "center",
            padding: spacing(1, 1.75),
            borderRadius: "4px",
            mx: 0.75,
            transition: transitions.create("background-color"),

            [`& > .${typographyClasses.root}, & svg`]: {
              transition: transitions.create("color"),
            },

            "& svg": {
              color: palette.gray[50],
            },

            [`& > .${typographyClasses.root}`]: {
              color: palette.gray[70],
              "&.count": {
                color: palette.gray[50],
              },
            },

            "&:hover": {
              backgroundColor: palette.gray[20],

              [`& > svg, & > .${typographyClasses.root}`]: {
                color: palette.gray[80],
                "&.count": {
                  color: palette.gray[60],
                },
              },
            },

            "&:focus-visible": {
              outline: `2px solid ${palette.blue[70]}`,
              outlineOffset: 2,
            },

            ...(active && {
              backgroundColor: palette.gray[30],

              [`& svg, & > .${typographyClasses.root}`]: {
                color: palette.gray[90],
              },
            }),
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box
          sx={{
            width: 20,
            marginRight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Typography variant="smallTextLabels" fontWeight={500}>
          {title}
        </Typography>
        <Fade in={typeof count !== "undefined"}>
          <Typography
            variant="smallTextLabels"
            fontWeight={500}
            className="count"
            sx={{ marginLeft: 1.25 }}
          >
            {count}
          </Typography>
        </Fade>
      </Link>
    </Tooltip>
  );
};
