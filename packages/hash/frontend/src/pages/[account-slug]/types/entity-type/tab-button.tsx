import { Typography } from "@mui/material";
import { ReactNode } from "react";
import { Link, LinkProps } from "../../../../shared/ui/link";

export type TabButtonProps = {
  label: string;
  icon: ReactNode;
} & LinkProps;

export const TabButton = ({
  label,
  icon,
  sx = [],
  ...props
}: TabButtonProps) => (
  <Link
    {...props}
    noLinkStyle
    sx={[
      ({ palette }) => ({
        pt: 2,
        pb: 1.5,
        px: 0.25,
        alignItems: "center",
        display: "flex",
        fill: palette.blue[70],
        "&:hover": {
          color: palette.primary.main,
          fill: palette.blue[60],
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    <Typography variant="smallTextLabels" sx={{ fontWeight: 500 }}>
      {label}
    </Typography>

    {icon ?? null}
  </Link>
);
