import { Card } from "fumadocs-ui/components/card";

import type { ReactNode } from "react";

/** A link to a page or a folder, showing its name and size above the summary its module comment opens with. */
export const IndexEntry = ({
  name,
  count,
  href,
  children,
}: {
  name: string;
  count: string;
  href: string;
  children?: ReactNode;
}): ReactNode => (
  <Card
    href={href}
    title={
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-mono">{name}</span>
        <span className="text-fd-muted-foreground shrink-0 font-mono text-xs font-normal">
          {count}
        </span>
      </span>
    }
  >
    {children}
  </Card>
);
