import { ServerCodeBlock } from "@fumadocs/base-ui/components/codeblock.rsc";

import { coloursOf, themes } from "./colours.js";

import type { CodeProps } from "../../lib/components.js";
import type { ReactNode } from "react";

/** The colours of a link naming `kind`, as a `style` attribute, or none for a kind the themes do not colour. */
const styleOf = (kind: string | undefined): string | undefined => {
  const colours = coloursOf(kind);
  if (colours === undefined) {
    return undefined;
  }

  return Object.entries(colours)
    .map(([name, colour]) => `${name}:${colour}`)
    .join(";");
};

export function ApiCode({ lang, code, links, title }: CodeProps): ReactNode {
  // Shiki wraps each linked name in an `a`, across the tokens it splits the name into.
  // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- rendered once, on the server
  const decorations = links.map(({ offset, length, href, kind }) => ({
    start: offset,
    end: offset + length,
    tagName: "a",
    properties: {
      href,
      class: "api-code-link",
      "data-kind": kind,
      style: styleOf(kind),
    },
  }));
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const codeblock = { title };

  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      themes={themes}
      decorations={decorations}
      codeblock={codeblock}
    />
  );
}
