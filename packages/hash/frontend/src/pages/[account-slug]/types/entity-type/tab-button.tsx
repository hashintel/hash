import { Link, LinkProps } from "../../../../shared/ui/link";

export const TabButton = ({ sx = [], children, ...props }: LinkProps) => (
  <Link
    {...props}
    noLinkStyle
    sx={[
      (theme) => ({
        pt: 2,
        pb: `calc(${theme.spacing(2)} - 3px)`,
        px: 0.25,
        borderBottom: 3,
        borderBottomColor: "transparent",
        alignItems: "center",
        display: "flex",
        lineHeight: 1,
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Link>
);
