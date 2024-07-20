import type { FunctionComponent, ReactNode } from "react";
import { ArrowRightIconRegular } from "@hashintel/design-system";
import type { LinkProps, Typography } from "@mui/material";
import { Link } from "../../ui";

export const ViewAllLink: FunctionComponent<{
  href: string;
  sx?: LinkProps["sx"];
  children: ReactNode;
}> = ({ href, sx, children }) => {
  return (
    <Link noLinkStyle href={href} tabIndex={-1} sx={sx}>
      <Typography
        variant={"smallTextLabels"}
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
        <ArrowRightIconRegular
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
