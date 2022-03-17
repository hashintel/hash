import Image from "next/image";
import { VFC } from "react";
import { Link } from "./Link";

export const Logo: VFC = () => (
  <Link href="/" sx={{ display: "flex" }}>
    <Image src="/logo.svg" width={176} height={18.38} />
  </Link>
);
