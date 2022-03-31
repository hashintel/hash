import { FC } from "react";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Typography, Tooltip, typographyClasses } from "@mui/material";
import { FontAwesomeIcon } from "../../icons";
import { Link } from "../../Link";

type NavLinkProps = {
  icon: IconDefinition;
  title: string;
  href: string;
  active?: boolean;
  tooltipTitle: string;
};

export const TopNavLink: FC<NavLinkProps> = ({
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
          padding: spacing(1, 2),
          borderRadius: "4px",
          mx: 0.5,
          transition: transitions.create("background-color"),

          [`& > .${typographyClasses.root}, & > svg`]: {
            transition: transitions.create("color"),
          },

          "& > svg": {
            color: palette.gray[50],
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

            [`& > svg, & > .${typographyClasses.root}`]: {
              color: palette.gray[90],
            },
          }),
        })}
      >
        <FontAwesomeIcon sx={{ mr: 1.5 }} icon={icon} />
        <Typography variant="smallTextLabels" fontWeight={500}>
          {title}
        </Typography>
      </Link>
    </Tooltip>
  );
};
