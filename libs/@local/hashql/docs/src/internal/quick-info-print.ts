import { Array, Effect, Option } from "effect";
import { isMappedTypeNode, isTupleTypeNode, isTypeNode } from "typescript/ast";

import * as Api from "../TypeScript/Api.js";

import type { Cause } from "effect";
import type { MappedTypeNode, Node } from "typescript/ast";

/** The descendants of `node` that `apart` picks, each the nearest on its branch, in the order the printer writes them. */
const nearest = (
  node: Node,
  apart: (node: Node) => boolean,
): readonly Node[] => {
  const found: Node[] = [];
  const pending = Array.fromIterable(node.childrenIter()).toReversed();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current !== undefined) {
      if (apart(current)) {
        found.push(current);
      } else {
        pending.push(
          ...Array.fromIterable(current.childrenIter()).toReversed(),
        );
      }
    }
  }

  return found;
};

/** `part` as it stands inside a line indented by `indentation`: the printer indents each further line of what it writes by the indentation of the line it started on. */
const embedded = (part: string, indentation: string): string =>
  part.replaceAll("\n", `\n${indentation}`);

/** The indentation of the line of `text` that the position `at` is on. */
const indentationAt = (text: string, at: number): string => {
  const start = text.lastIndexOf("\n", at - 1) + 1;
  const [indentation = ""] = /^[\t ]*/u.exec(text.slice(start)) ?? [];

  return indentation;
};

/** Where `part`, printed on its own, stands inside `text` at or after `from`, and the text it takes up there. */
const locate = (
  text: string,
  part: string,
  from: number,
): Option.Option<{ readonly at: number; readonly taken: string }> => {
  const [first = ""] = part.split("\n");
  let at = text.indexOf(first, from);

  while (at !== -1) {
    const taken = embedded(part, indentationAt(text, at));
    if (text.startsWith(taken, at)) {
      return Option.some({ at, taken });
    }

    at = text.indexOf(first, at + 1);
  }

  return Option.none();
};

/**
 * `text`, the printed form of syntax that holds `parts` in this order, with the printed form of each part replaced by the matching one of `replacements`.
 *
 * A part the text does not hold as the printer writes it on its own stays as it is.
 */
const replace = Effect.fnUntraced(function* (
  text: string,
  parts: readonly Node[],
  replacements: readonly string[],
) {
  const api = yield* Api.Api;
  const printed = yield* Effect.forEach(parts, api.print);
  let result = text;
  let from = 0;

  for (const [part, replacement] of Array.zip(printed, replacements)) {
    const found = locate(result, part, from);
    if (Option.isSome(found)) {
      const { at, taken } = found.value;
      const written = embedded(replacement, indentationAt(result, at));
      result = `${result.slice(0, at)}${written}${result.slice(at + taken.length)}`;
      from = at + written.length;
    }
  }

  return result;
});

/** The text that stands for the part `index` of a mapped type while the type collapses onto one line. No printed syntax holds a null character. */
const hole = (index: number): string => `\0${index}\0`;

/** A mapped type on one line, such as `{ readonly [K in keyof T]: T[K]; }`. Each type inside it keeps its own lines. */
const mapped: (
  node: MappedTypeNode,
) => Effect.Effect<string, Cause.UnknownError, Api.Api> = Effect.fnUntraced(
  function* (node: MappedTypeNode) {
    const api = yield* Api.Api;
    const parts = nearest(node, isTypeNode);
    const text = yield* api.print(node);
    const shell = yield* replace(
      text,
      parts,
      Array.map(parts, (_, index) => hole(index)),
    );
    // oxlint-disable-next-line eslint/no-use-before-define -- `print` and `mapped` print each other's types, and this runs after module initialisation.
    const written = yield* Effect.forEach(parts, print);

    return Array.reduce(
      written,
      shell.replaceAll(/\s*\n\s*/gu, " "),
      (line, part, index) => line.replace(hole(index), () => part),
    );
  },
);

/**
 * `node` as source text, with each tuple and each mapped type in it on one line.
 *
 * The compiler marks those types to print on one line where it builds them, and the API's printer receives the syntax without the marks.
 */
export const print: (
  node: Node,
) => Effect.Effect<string, Cause.UnknownError, Api.Api> = Effect.fnUntraced(
  function* (node: Node) {
    if (isTupleTypeNode(node)) {
      const elements = yield* Effect.forEach(node.elements, print);

      return `[${elements.join(", ")}]`;
    }

    if (isMappedTypeNode(node)) {
      return yield* mapped(node);
    }

    const api = yield* Api.Api;
    const parts = nearest(
      node,
      (child) => isTupleTypeNode(child) || isMappedTypeNode(child),
    );
    const text = yield* api.print(node);
    const written = yield* Effect.forEach(parts, print);

    return yield* replace(text, parts, written);
  },
);
