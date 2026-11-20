import {
  Array,
  Effect,
  Function,
  HashMap,
  Match,
  Option,
  Order,
  Result,
  Schema,
  pipe,
} from "effect";

import * as ExternalTarget from "./ExternalTarget.js";
import * as Signature from "./Signature.js";

import type * as AST from "./AST/index.js";
import type * as References from "./internal/references.js";
import type { Data } from "effect";
import type { Identifier, Node } from "typescript/ast";

/** A name that links to its target can also carry hover text. A hover-only name links nowhere. The output turns a target into a destination. */
export type Name = Data.TaggedEnum<{
  Link: {
    readonly offset: number;
    readonly length: number;
    readonly target: AST.Target.Interned;
    readonly meaning: ExternalTarget.Meaning;
    readonly quickInfo: Option.Option<string>;
  };
  Hover: {
    readonly offset: number;
    readonly length: number;
    readonly quickInfo: string;
  };
}>;

/** Sorted, non-overlapping annotations over unchanged UTF-16 source text. */
export interface Source {
  readonly text: string;
  readonly names: readonly Name[];
}

/** Offsets refer to the accompanying text, in UTF-16 code units. */
export interface Link {
  readonly offset: number;
  readonly length: number;
  readonly target: AST.Target.Interned;
  /** What the name means where it stands, which picks the page of an item outside the package. */
  readonly meaning: ExternalTarget.Meaning;
}

/** Quick info as an editor shows it over the name at `offset`. */
export interface Hover {
  readonly offset: number;
  readonly length: number;
  readonly text: string;
}

export interface Input {
  readonly text: string;
  readonly links: readonly Link[];
  readonly quickInfo: readonly Hover[];
}

/** A link over `name` where it stands in its own source text, such as a name in an example's code. */
export const linkOf: {
  (target: AST.Target.Interned): (name: Identifier) => Link;
  (name: Identifier, target: AST.Target.Interned): Link;
} = Function.dual(2, (name: Identifier, target: AST.Target.Interned): Link => ({
  offset: name.getStart(),
  length: name.getWidth(),
  target,
  meaning: ExternalTarget.meaning(name),
}));

// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class CodeError extends Schema.TaggedError<CodeError>()("CodeError", {
  reason: Schema.TaggedUnion({
    MissingSignature: {},
    InvalidRange: {
      // oxlint-disable-next-line effecttsgo/schema-number -- The error retains the invalid coordinate, including NaN and infinity.
      offset: Schema.Number,
      // oxlint-disable-next-line effecttsgo/schema-number -- The error retains the invalid length, including NaN and infinity.
      length: Schema.Number,
      size: Schema.Int,
    },
    ConflictingRange: { offset: Schema.Int },
    OverlappingRanges: { offset: Schema.Int, previousEnd: Schema.Int },
  }),
}) {}

const conflict = (offset: number): CodeError =>
  CodeError.make({ reason: { _tag: "ConflictingRange", offset } });

/** Joins link and hover annotations before markup construction, refusing ambiguous or overlapping ranges. */
export const prepare = ({
  text,
  links,
  quickInfo,
}: Input): Result.Result<Source, CodeError> =>
  Result.gen(function* () {
    for (const { offset, length } of Array.appendAll(links, quickInfo)) {
      if (
        !Number.isInteger(offset) ||
        !Number.isInteger(length) ||
        offset < 0 ||
        length <= 0 ||
        offset + length > text.length
      ) {
        return yield* Result.fail(
          CodeError.make({
            reason: { _tag: "InvalidRange", offset, length, size: text.length },
          }),
        );
      }
    }

    let names = HashMap.empty<number, Name>();
    for (const link of links) {
      const previous = HashMap.get(names, link.offset);
      if (
        Option.isSome(previous) &&
        (previous.value._tag !== "Link" ||
          previous.value.length !== link.length ||
          previous.value.target !== link.target)
      ) {
        return yield* Result.fail(conflict(link.offset));
      }
      names = HashMap.set(names, link.offset, {
        _tag: "Link",
        offset: link.offset,
        length: link.length,
        target: link.target,
        meaning: link.meaning,
        quickInfo: Option.none(),
      });
    }

    for (const info of quickInfo) {
      const previous = HashMap.get(names, info.offset);
      if (Option.isNone(previous)) {
        names = HashMap.set(names, info.offset, {
          _tag: "Hover",
          offset: info.offset,
          length: info.length,
          quickInfo: info.text,
        });
      } else {
        const name = previous.value;
        const previousInfo = Match.value(name).pipe(
          Match.tags({
            Link: ({ quickInfo: value }) => value,
            Hover: ({ quickInfo: value }) => Option.some(value),
          }),
          Match.exhaustive,
        );

        if (
          name.length !== info.length ||
          Option.exists(previousInfo, (value) => value !== info.text)
        ) {
          return yield* Result.fail(conflict(info.offset));
        }

        if (name._tag === "Link") {
          names = HashMap.set(names, info.offset, {
            ...name,
            quickInfo: Option.some(info.text),
          });
        }
      }
    }

    const ordered = pipe(
      names,
      HashMap.values,
      Array.fromIterable,
      Array.sortWith((name: Name) => name.offset, Order.Number),
    );

    let previousEnd = 0;
    for (const { offset, length } of ordered) {
      if (offset < previousEnd) {
        return yield* Result.fail(
          CodeError.make({
            reason: { _tag: "OverlappingRanges", offset, previousEnd },
          }),
        );
      }

      previousEnd = offset + length;
    }

    return { text, names: ordered };
  });

/** Prints `nodes` with each name `names` resolves as a link. A name a transform made itself resolves to nothing. */
export const print = Effect.fnUntraced(function* (
  nodes: readonly Node[],
  names: References.Names,
) {
  const printed = yield* Signature.print(nodes);
  const links = Array.flatMap(
    printed.occurrences,
    ({ node, offset, length }): Name[] =>
      Array.map(Option.toArray(names(node)), (target): Name => ({
        _tag: "Link",
        offset,
        length,
        target,
        meaning: ExternalTarget.meaning(node),
        quickInfo: Option.none(),
      })),
  );

  return { text: printed.text, names: links } satisfies Source;
});
