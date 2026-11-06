import { Array, Function, Option, String, pipe } from "effect";

import * as AST from "../AST/index.js";

import type * as Trait from "../Trait.js";
import type * as Node from "./Node.js";
import type {
  DocCodeSpan,
  DocEscapedText,
  DocFencedCode,
  DocHtmlStartTag,
  DocLinkTag,
  DocParagraph,
  DocPlainText,
  DocSoftBreak,
} from "@microsoft/tsdoc";
import type { Equivalence } from "effect";

/** A trait the reference explains itself, whose explanation no comment holds. */
export type Explained = Extract<Trait.Trait, { readonly _tag: "Explained" }>;

/** Text as a comment writes it. A link's label is text whose origin is the link. */
export interface Text extends Node.Node<
  "text",
  DocPlainText | DocEscapedText | DocSoftBreak | DocLinkTag | Explained
> {
  readonly value: string;
}

/** Code in prose: a code span, a `<code>` element, or the label of a link that names a declaration. */
export interface InlineCode extends Node.Node<
  "inlineCode",
  DocCodeSpan | DocHtmlStartTag | DocLinkTag | Explained
> {
  readonly value: string;
}

/** A `{@link}` and what it names: the reference its name resolved to, or the address it writes. The output turns a reference into a destination. */
export interface Link extends Node.Parent<
  "link",
  DocLinkTag,
  Text | InlineCode
> {
  readonly destination: AST.Reference.Reference | URL;
}

export type Phrasing = Text | InlineCode | Link;

export interface Paragraph extends Node.Parent<
  "paragraph",
  DocParagraph | Explained,
  Phrasing
> {}

export interface Code extends Node.Node<"code", DocFencedCode> {
  readonly language: Option.Option<string>;
  readonly value: string;
}

export type Block = Paragraph | Code;

/** What phrasing says, with adjacent text joined, so where TSDoc split a line does not decide whether two pieces of prose are equal. */
type Reading =
  | { readonly type: "text" | "inlineCode"; readonly value: string }
  | {
      readonly type: "link";
      readonly destination: AST.Reference.Reference.Target | URL;
      readonly label: readonly Reading[];
    };

const readingOf = (nodes: readonly Phrasing[]): readonly Reading[] => {
  const output: Reading[] = [];
  for (const node of nodes) {
    const previous = output.at(-1);
    if (node.type === "link") {
      const { destination } = node;
      output.push({
        type: "link",
        destination:
          destination instanceof URL ? destination : destination.target,
        label: readingOf(node.children),
      });
    } else if (node.type === "text" && previous?.type === "text") {
      output[output.length - 1] = {
        type: "text",
        value: previous.value + node.value,
      };
    } else {
      output.push({ type: node.type, value: node.value });
    }
  }

  return output;
};

const sameDestination = (
  self: AST.Reference.Reference.Target | URL,
  that: AST.Reference.Reference.Target | URL,
): boolean => {
  if (self instanceof URL || that instanceof URL) {
    return (
      self instanceof URL && that instanceof URL && self.href === that.href
    );
  }

  return AST.Reference.sameTarget(self, that);
};

const readingEquivalence: Equivalence.Equivalence<Reading> = (self, that) => {
  if (self.type === "link") {
    return (
      that.type === "link" &&
      sameDestination(self.destination, that.destination) &&
      Array.makeEquivalence(readingEquivalence)(self.label, that.label)
    );
  }

  return that.type === self.type && that.value === self.value;
};

const phrasingEquivalence: Equivalence.Equivalence<readonly Phrasing[]> = (
  self,
  that,
) =>
  Array.makeEquivalence(readingEquivalence)(readingOf(self), readingOf(that));

/** Equal phrasing has the same words, code and destinations, wherever it was written. */
export const phrasing: {
  (that: readonly Phrasing[]): (self: readonly Phrasing[]) => boolean;
  (self: readonly Phrasing[], that: readonly Phrasing[]): boolean;
} = Function.dual(2, phrasingEquivalence);

const blockEquivalence: Equivalence.Equivalence<Block> = (self, that) => {
  if (self.type === "code") {
    return (
      that.type === "code" &&
      that.value === self.value &&
      Option.makeEquivalence(String.Equivalence)(self.language, that.language)
    );
  }

  return (
    that.type === "paragraph" &&
    phrasingEquivalence(self.children, that.children)
  );
};

/** Equal prose says the same thing about the same destinations, wherever it was written. */
export const equivalence: {
  (that: readonly Block[]): (self: readonly Block[]) => boolean;
  (self: readonly Block[], that: readonly Block[]): boolean;
} = Function.dual(2, Array.makeEquivalence(blockEquivalence));

/** The words of `nodes`, with code and link labels as they read. */
const text = (nodes: readonly Phrasing[]): string =>
  pipe(
    nodes,
    Array.map((node) => {
      if (node.type === "link") {
        return text(node.children);
      }

      return node.value;
    }),
    Array.join(""),
  );

/** The first paragraph as plain text, for search and metadata, or nothing when the prose opens with code or is empty. */
export const plain = (blocks: readonly Block[]): Option.Option<string> =>
  pipe(
    blocks,
    Array.findFirst((block) => block.type === "paragraph"),
    Option.map((paragraph) => text(paragraph.children)),
  );

/** The first sentence of `value`: up to the first full stop, exclamation or question mark that ends it. */
export const sentence = (value: string): string =>
  (/^.*?[.!?](?=\s+[A-Z`{(]|\s*$)/su.exec(value)?.[0] ?? value).trim();
