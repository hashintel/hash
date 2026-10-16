import { Array, Effect, Option, Struct, flow, pipe } from "effect";
import { splitTokens } from "shiki/core";

import * as CodeBlock from "../src/CodeBlock.js";

import type { Element, ElementContent } from "hast";
import type { ShikiTransformer } from "shiki";

const isElement = (node: ElementContent): node is Element =>
  node.type === "element";

// A popup's content is the hover text, which holds no names of the code.
const triggerIn = (node: Element): Option.Option<Element> =>
  pipe(
    node.children,
    Array.filter(isElement),
    Array.filter(({ tagName }) => tagName !== "PopupContent"),
    Array.findFirst((child) =>
      pipe(
        child,
        Option.liftPredicate(({ tagName }) => tagName === "PopupTrigger"),
        Option.orElse(() => triggerIn(child)),
      ),
    ),
  );

// Twoslash has replaced a hovered name's text with its popup by now, so its trigger becomes the link and the hover stays.
const link = (node: Element): void => {
  for (const child of Array.filter(node.children, isElement)) {
    const url = child.properties["data-reference"];

    if (typeof url === "string") {
      delete child.properties["data-reference"];
      Option.match(triggerIn(child), {
        onNone: () => {
          child.tagName = "a";
          child.properties.href = url;
        },
        onSome: (trigger) => {
          trigger.properties.href = url;
        },
      });
    } else {
      link(child);
    }
  }
};

/** Links the names a signature block's meta lists to the pages that document them. Place it after the Twoslash transformer. */
export const referenceLinks = (): ShikiTransformer => ({
  name: "hashql:reference-links",
  tokens(lines) {
    const code = pipe(
      lines,
      Array.map(flow(Array.map(Struct.get("content")), Array.join(""))),
      Array.join("\n"),
    );
    // A transformer runs synchronously inside Shiki, and a block whose links do not fit its code fails the build.
    const links = Effect.runSync(
      CodeBlock.place(code, this.options.meta?.__raw ?? ""),
    );
    const split = splitTokens(
      lines,
      Array.flatMap(links, ({ start, end }) => [start, end]),
    );

    // Shiki copies a token's attributes onto the element it renders.
    for (const token of Array.flatten(split)) {
      const found = Array.findFirst(
        links,
        ({ start, end }) =>
          start <= token.offset && token.offset + token.content.length <= end,
      );

      if (Option.isSome(found)) {
        token.htmlAttrs = {
          ...token.htmlAttrs,
          "data-reference": found.value.url,
        };
      }
    }

    return split;
  },
  code(code) {
    link(code);
  },
});
