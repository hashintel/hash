import { FC } from "react";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Typography, Tooltip } from "@mui/material";
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
        sx={{
          display: "flex",
          alignItems: "center",
          padding: "9px 18px",
          mx: 0.5,

          "& > svg": {
            color: ({ palette }) => palette.gray[50],
          },

          "& > span": {
            color: ({ palette }) => palette.gray[70],
          },

          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],

            "& > svg, & > span": {
              color: ({ palette }) => palette.gray[80],
            },
          },

          "&:focus": {
            outline: ({ palette }) => `2px solid ${palette.blue[50]}`,
            outlineOffset: 2,
          },

          ...(active && {
            backgroundColor: ({ palette }) => palette.gray[30],

            "& > svg, & > span": {
              color: ({ palette }) => palette.gray[90],
            },
          }),
        }}
      >
        <FontAwesomeIcon
          sx={{
            mr: 1.5,
            // color: ({ palette }) => palette.gray[50],
          }}
          icon={icon}
        />
        <Typography
          variant="smallTextLabels"
          sx={
            {
              // color: ({ palette }) => palette.gray[70],
            }
          }
        >
          {title}
        </Typography>
      </Link>
    </Tooltip>
  );
};
