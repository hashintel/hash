import defaultMdxComponents from "@fumadocs/base-ui/mdx";

import * as Colours from "./colours.js";

import type { AnchorHTMLAttributes, ReactNode } from "react";

const { a: Link } = defaultMdxComponents;

/** The props of a link in a generated page's prose. `data-kind` is the kind of the export a link names as code. */
export interface ApiLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly "data-kind"?: string | undefined;
}

/** A link in a generated page's prose, as fumadocs draws one. A link that names an export as code draws the name in the colour the themes give that kind of name in code. */
export function ApiLink({
  href,
  children,
  "data-kind": kind,
}: ApiLinkProps): ReactNode {
  const colours = Colours.coloursOf(kind);
  const link = <Link href={href}>{children}</Link>;
  if (colours === undefined) {
    return link;
  }

  return (
    <span className="api-link" style={colours}>
      {link}
    </span>
  );
}
