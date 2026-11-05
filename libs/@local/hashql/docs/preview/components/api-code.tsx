import { ServerCodeBlock } from "@fumadocs/base-ui/components/codeblock.rsc";
import { highlight } from "fumadocs-core/highlight";

import { ApiQuickInfo } from "./api-quick-info.js";
import * as Colours from "./colours.js";

import type * as Components from "../../src/components.js";
import type { ReactNode } from "react";

/** The colours of a link naming `kind`, as a `style` attribute, or none for a kind the themes do not colour. */
const styleOf = (kind: string | undefined): string | undefined => {
  const colours = Colours.coloursOf(kind);
  if (colours === undefined) {
    return undefined;
  }

  return Object.entries(colours)
    .map(([name, colour]) => `${name}:${colour}`)
    .join(";");
};

/** An element Shiki wraps the tokens of one name in. */
interface Decoration {
  readonly start: number;
  readonly end: number;
  readonly tagName: string;
  readonly properties: Readonly<Record<string, string | undefined>>;
}

/** Wraps one linked name in a link to its page. A name with quick info gets an `api-quick-info` element instead, and that element draws the link itself. */
const linkOf = (
  { offset, length, href, kind }: Components.CodeLink,
  text: string | undefined,
): Decoration => {
  const end = offset + length;
  const style = styleOf(kind);
  if (text === undefined) {
    return {
      start: offset,
      end,
      tagName: "a",
      properties: { href, class: "api-code-link", "data-kind": kind, style },
    };
  }

  return {
    start: offset,
    end,
    tagName: "api-quick-info",
    properties: { text, href, kind, style },
  };
};

/** The elements Shiki wraps names in: one per linked name, and one per other name with quick info. */
const decorationsOf = ({
  links,
  quickInfo,
}: Pick<Components.CodeProps, "links" | "quickInfo">): Decoration[] => {
  const texts = new Map(quickInfo.map(({ offset, text }) => [offset, text]));
  const linked = new Set(links.map(({ offset }) => offset));
  const unlinked = quickInfo
    .filter(({ offset }) => !linked.has(offset))
    .map(({ offset, length, text }): Decoration => ({
      start: offset,
      end: offset + length,
      tagName: "api-quick-info",
      properties: { text },
    }));

  return [
    ...links.map((link) => linkOf(link, texts.get(link.offset))),
    ...unlinked,
  ];
};

const components = { "api-quick-info": ApiQuickInfo };

/** What the highlighter reads before code that is part of something else, and does not show, so that it highlights the code as it reads there. */
const contexts = { type: "let _: ", member: "interface _ {\n" } as const;

/** The language of code that names none, which the highlighter shows as plain text. */
const plain = "text";

/** A code block, or a type on a line of text, highlighted with the themes the code blocks use. */
export async function ApiCode({
  lang = plain,
  code,
  links,
  quickInfo,
  context,
}: Components.CodeProps): Promise<ReactNode> {
  // Shiki wraps each name in an element, across the tokens it splits the name into.
  const decorations = decorationsOf({ links, quickInfo });
  if (context === "type") {
    const highlighted = await highlight(code, {
      lang,
      themes: Colours.themes,
      defaultColor: false,
      structure: "inline",
      grammarContextCode: contexts.type,
      decorations,
      components,
    });

    return (
      <span className="shiki api-type">
        <code>{highlighted}</code>
      </span>
    );
  }

  if (context === "member") {
    return (
      <ServerCodeBlock
        code={code}
        lang={lang}
        themes={Colours.themes}
        decorations={decorations}
        grammarContextCode={contexts.member}
        components={components}
      />
    );
  }

  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      themes={Colours.themes}
      decorations={decorations}
      components={components}
    />
  );
}
