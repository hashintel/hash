import { DocsLayout } from "@fumadocs/base-ui/layouts/docs";

import { source } from "../../../lib/source.js";

import type { ReactNode } from "react";

const nav = { title: "HashQL" };

export default function Layout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <DocsLayout tree={source.getPageTree()} nav={nav}>
      {children}
    </DocsLayout>
  );
}
