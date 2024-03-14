import type { LinkProps } from "@mui/material";
import { Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { ArrowRightIcon } from "../../icons/arrow-right";
import { Link } from "../../ui";

export const ViewAllLink: FunctionComponent<{
  href: string;
  sx?: LinkProps["sx"];
  children: ReactNode;
}> = ({ href, sx, children }) => {
  return (
    <Link href={href} noLinkStyle tabIndex={-1} sx={sx}>
      <Typography
        variant="smallTextLabels"
        sx={({ palette }) => ({
          fontWeight: 500,
          color: palette.gray[80],
          fontSize: 14,
          px: 1.5,
          py: 0.5,
          borderRadius: "100px",
          ":hover": {
            color: palette.gray[90],
            background: palette.gray[15],
            "> svg": {
              color: palette.gray[90],
              marginLeft: 1.5,
            },
          },
        })}
      >
        {children}
        <ArrowRightIcon
          sx={{
            marginLeft: 0.75,
            fontSize: 10,
            color: ({ palette }) => palette.gray[80],
            transition: ({ transitions }) =>
              transitions.create(["color", "margin-left"]),
          }}
        />
      </Typography>
    </Link>
  );
};
