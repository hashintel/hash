import { Array, Effect, Schema } from "effect";
import { format } from "oxfmt";
import * as TypeScript from "typescript/ast";

import * as Syntax from "./internal/signature-syntax.js";
import * as Api from "./TypeScript/Api.js";
import * as Node from "./TypeScript/Node.js";

import type { Cause, Scope } from "effect";

export interface Printed {
  readonly text: string;
  readonly occurrences: readonly {
    readonly node: TypeScript.Identifier;
    readonly offset: number;
    readonly length: number;
  }[];
}

const Reason = Schema.TaggedUnion({
  InvalidSyntax: { text: Schema.String },
  IdentifierMismatch: {
    expected: Schema.Array(Schema.String),
    actual: Schema.Array(Schema.String),
  },
});

/** A failed print never associates identifiers from different syntax streams. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class PrintError extends Schema.TaggedError<PrintError>()("PrintError", {
  reason: Reason,
}) {}

const bodyRange = (
  parsed: TypeScript.SourceFile,
  wrapped: boolean,
): readonly [number, number] => {
  const first = parsed.statements[0];
  if (wrapped && first !== undefined) {
    if (
      TypeScript.isClassDeclaration(first) ||
      TypeScript.isInterfaceDeclaration(first) ||
      TypeScript.isEnumDeclaration(first)
    ) {
      const head = first.members[0];
      const last = first.members.at(-1);
      if (head !== undefined && last !== undefined) {
        return [head.getStart(), last.end];
      }
    } else if (
      TypeScript.isFunctionDeclaration(first) &&
      first.type !== undefined
    ) {
      return [first.type.getStart(), first.type.end];
    } else if (TypeScript.isTypeAliasDeclaration(first)) {
      return [first.type.getStart(), first.type.end];
    }
  }

  return [0, parsed.text.trimEnd().length];
};

/** Prints once at the output boundary, assigning positions as each identifier is emitted. */
export const print = Effect.fnUntraced(function* (
  nodes: readonly TypeScript.Node[],
): Effect.fn.Return<
  Printed,
  Cause.UnknownError | PrintError,
  Api.Api | Scope.Scope
> {
  const original = nodes[0];
  if (original === undefined) {
    return { text: "", occurrences: [] };
  }

  const api = yield* Api.Api;
  const raw = Array.join(yield* Effect.forEach(nodes, api.print), "\n");
  const { prefix, suffix } = Syntax.context(original);
  // oxlint-disable-next-line typescript/promise-function-async -- Effect captures both promise rejections and synchronous formatter exceptions.
  const formatted = yield* Effect.tryPromise(() =>
    format("signature.d.ts", prefix + raw + suffix, { printWidth: 80 }),
  );
  if (formatted.errors.length > 0) {
    return yield* PrintError.make({
      reason: { _tag: "InvalidSyntax", text: raw },
    });
  }

  const parsed = yield* api.parse(formatted.code);
  const [start, end] = bodyRange(parsed, prefix !== "");
  const before = Array.flatMap(nodes, Node.identifiers);
  const after = Array.filter(
    Node.identifiers(parsed),
    (node) => node.getStart() >= start && node.end <= end,
  );
  const expected = Array.map(before, (node) => node.text);
  const actual = Array.map(after, (node) => node.text);
  if (
    expected.length !== actual.length ||
    !Array.every(Array.zip(expected, actual), ([left, right]) => left === right)
  ) {
    return yield* PrintError.make({
      reason: { _tag: "IdentifierMismatch", expected, actual },
    });
  }

  // The formatter indents a member inside the wrapper that gives it its grammar, and each further line of the member keeps that margin.
  const line = formatted.code.lastIndexOf("\n", start - 1) + 1;
  const [margin = ""] = /^[\t ]*/u.exec(formatted.code.slice(line)) ?? [];
  const copied = (from: number, to: number): string =>
    formatted.code.slice(from, to).replaceAll(`\n${margin}`, "\n");

  let text = "";
  let at = start;
  const occurrences: Printed["occurrences"][number][] = [];
  for (const [node, emitted] of Array.zip(before, after)) {
    text += copied(at, emitted.getStart());
    const offset = text.length;
    let spelling = formatted.code.slice(emitted.getStart(), emitted.end);
    if (Syntax.isElision(node)) {
      spelling = "…";
    }

    text += spelling;
    occurrences.push({ node, offset, length: spelling.length });
    at = emitted.end;
  }

  text += copied(at, end);
  return { text, occurrences };
}, Effect.scoped);
