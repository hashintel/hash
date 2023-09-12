import { ComponentProps, FunctionComponent } from "react";

import { HashDotDevLogo } from "./icons/hash-dot-dev-logo";
import { Link } from "./link";

export const Logo: FunctionComponent<
  Omit<ComponentProps<typeof Link>, "href">
> = ({ sx = [], ...props }) => (
  <Link
    href="/"
    sx={[
      { display: "flex", "&:hover": { bgcolor: "transparent" } },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  >
    <HashDotDevLogo sx={{ height: 19, width: 158 }} />
  </Link>
);
