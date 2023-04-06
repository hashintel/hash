import { Link, LinkProps } from "@mui/material";
import { FunctionComponent } from "react";
import { CircleQuestionIcon } from "./icons/circle-question";

export type GetHelpProps = {
  href: string;
} & LinkProps;

export const GetHelpLink: FunctionComponent<GetHelpProps> = ({
  href,
  sx,
  ...props
}) => {
  return (
    <Link
      {...props}
      href={href}
      target="_blank"
      variant="regularTextLabels"
      sx={[
        ({ palette, transitions }) => ({
          display: "inline-flex",
          alignItems: "center",
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: -0.02,
          whiteSpace: "nowrap",
          textDecoration: "none !important",
          color: `${palette.gray[50]} !important`,
          transition: transitions.create("color"),
          "> svg": {
            transition: transitions.create("fill"),
            fill: palette.gray[40],
          },
          ":hover": {
            color: `${palette.gray[60]} !important`,
            "& > svg": {
              fill: palette.gray[50],
            },
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      Get help{" "}
      <CircleQuestionIcon sx={{ fontSize: 16, ml: 1, fill: "inherit" }} />
    </Link>
  );
};
