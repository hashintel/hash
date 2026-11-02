import { ServerCodeBlock } from "@fumadocs/base-ui/components/codeblock.rsc";

import type { CodeProps } from "../../lib/components.js";
import type { ReactNode } from "react";

export function ApiCode({ lang, code, links, title }: CodeProps): ReactNode {
  // Shiki wraps each linked name in an `a`, across the tokens it splits the name into.
  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- rendered once, on the server
  const decorations = links.map(({ offset, length, href }) => ({
    start: offset,
    end: offset + length,
    tagName: "a",
    properties: { href, class: "api-code-link" },
  }));
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const codeblock = { title };

  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      decorations={decorations}
      codeblock={codeblock}
    />
  );
}
