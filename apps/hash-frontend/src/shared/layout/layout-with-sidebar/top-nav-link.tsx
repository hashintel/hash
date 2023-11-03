import { Box, Tooltip, Typography, typographyClasses } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

import { Link } from "../../ui";

type NavLinkProps = {
  icon: ReactNode;
  title: string;
  href: string;
  active?: boolean;
  tooltipTitle: string;
};

export const TopNavLink: FunctionComponent<NavLinkProps> = ({
  icon,
  title,
  href,
  active,
  tooltipTitle,
}) => {
  return (
    <Tooltip title={tooltipTitle}>
      <Link
        href={href}
        noLinkStyle
        sx={({ palette, transitions, spacing }) => ({
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
            color: palette.gray[40],
          },

          [`& > .${typographyClasses.root}`]: {
            color: palette.gray[70],
          },

          "&:hover": {
            backgroundColor: palette.gray[20],

            [`& > svg, & > .${typographyClasses.root}`]: {
              color: palette.gray[80],
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
        })}
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
      </Link>
    </Tooltip>
  );
};
