import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { source } from "../../lib/source";

import type { ReactNode } from "react";

const navigation = { title: "HashQL TypeScript", url: "/docs" };

export default function Layout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <DocsLayout tree={source.getPageTree()} nav={navigation}>
      {children}
    </DocsLayout>
  );
}
