import Image from "next/image";
import { ComponentProps, FunctionComponent } from "react";
import { Link } from "./Link";

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
    <Image src="/logo.svg" width={176} height={18.38} />
  </Link>
);
