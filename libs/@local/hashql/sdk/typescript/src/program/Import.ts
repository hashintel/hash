/**
 * Typed lexical imports shared by the authoring APIs.
 *
 * Selection changes local names, not the declared types or callable capabilities. Each selected producer rebinds itself before the namespace join. The compiler remains responsible for resolving the emitted import.
 *
 * @module
 */
import { Array, Result, SchemaParser, pipe } from "effect";

import { isReadonlyArray } from "../internal/array.js";
import { relocate } from "../internal/relocation.js";
import * as JExpr from "../jexpr/index.js";
import * as AST from "./ast/index.js";
import * as ProgramError from "./ProgramError.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as Module from "./Module.js";
import type * as Namespace from "./Namespace.js";
import type { ReadonlyRecord } from "effect/Record";

/** The string export names of a module across its three tables. */
type Name<M extends Module.Any> = Extract<
  keyof M["modules"] | keyof M["values"] | keyof M["types"],
  string
>;

/**
 * The exports an import brings into scope and the local names they take.
 *
 * - `"*"` imports every own name in the module's three tables.
 * - An array of export names imports those names unchanged.
 * - A record maps export names to local aliases. The alias `"_"` keeps the export's own name.
 *
 * One name selects the module, type and value exports that share it. Each imported export emits its local name, and the import wraps the expression built in its scope in a `use` of the module's path. An alias that is not a HashQL identifier, or a symbol key in the record, fails construction with `InvalidImportName`.
 *
 * @example <caption>Import a built-in function under another name.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Expression, JExpr, Prelude } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const { math } = Prelude.builtin.modules;
 * const result = program({}, ($) => {
 *   const { plus } = $.import(math, { add: "plus" });
 *   return plus(1n, 2n);
 * });
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Result.flatMap(result, Expression.toJExpr))),
 *   '["::kernel::special_form::use","::core::math",{"#struct":{"add":"plus"}},["plus",{"#literal":1},{"#literal":2}]]',
 * );
 *
 * const invalid = program({}, ($) => {
 *   $.import(math, { add: "not an identifier" });
 *   return $.literal(true);
 * });
 * assert.ok(Result.isFailure(invalid));
 * assert.equal(invalid.failure.reason._tag, "InvalidImportName");
 * ```
 */
export type Selection<M extends Module.Any> =
  | "*"
  | readonly Name<M>[]
  | Partial<ReadonlyRecord<Name<M>, string>>;

/** Filters and renames one table according to a selection. */
type Selected<E, I> = I extends "*"
  ? E
  : I extends readonly string[]
    ? Pick<E, Extract<keyof E, I[number]>>
    : {
        readonly [K in keyof E as K extends keyof I
          ? I[K] extends "_"
            ? K
            : I[K] extends string
              ? I[K]
              : never
          : never]: E[K];
      };

/** The tables an import adds to a scope, keyed by local name and keeping each selected export's type. */
export interface Imported<M extends Module.Any, I> {
  readonly modules: Selected<M["modules"], I>;
  readonly values: Selected<M["values"], I>;
  readonly types: Selected<M["types"], I>;
}

interface Plan {
  readonly names: ReadonlyMap<
    string,
    { readonly alias: string; readonly ident: JExpr.Ident.Ident }
  >;
  readonly syntax: JExpr.Imports;
}

const decodeName = SchemaParser.decodeUnknownResult(JExpr.Ident.Schema);

const importName = (
  name: string | undefined,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  pipe(
    decodeName(name),
    Result.mapError(
      (cause) =>
        new ProgramError.Construction({
          reason: ProgramError.Reason.InvalidImportName({
            name: String(name),
            cause,
          }),
        }),
    ),
  );

const requests = (
  module: Module.Any,
  selection: Selection<Module.Any>,
): readonly (readonly [string, string | undefined])[] => {
  if (selection === "*") {
    return Array.map(
      [
        ...new Set([
          ...Object.getOwnPropertyNames(module.modules),
          ...Object.getOwnPropertyNames(module.types),
          ...Object.getOwnPropertyNames(module.values),
        ]),
      ],
      (name) => [name, name] as const,
    );
  }

  if (isReadonlyArray(selection)) {
    return pipe(
      selection,
      Array.map((name) => [name, name] as const),
    );
  }

  return pipe(
    Object.getOwnPropertyNames(selection),
    Array.map((name) => {
      const alias = selection[name];
      if (alias === "_") {
        return [name, name] as const;
      }

      return [name, alias] as const;
    }),
  );
};

const plan = (
  module: Module.Any,
  selection: Selection<Module.Any>,
): Result.Result<Plan, ProgramError.Construction> =>
  Result.gen(function* () {
    const names = new Map<
      string,
      { readonly alias: string; readonly ident: JExpr.Ident.Ident }
    >();

    const aliases: [string, string][] = [];
    for (const [name, alias] of requests(module, selection)) {
      const ident = yield* importName(alias);
      names.set(name, { alias: String(alias), ident });
      aliases.push([name, JExpr.Ident.compile(ident)]);
    }

    if (typeof selection === "object") {
      for (const name of Object.getOwnPropertySymbols(selection)) {
        yield* importName(String(name));
      }
    }

    let syntax: JExpr.Imports = "*";
    if (isReadonlyArray(selection)) {
      syntax = Object.freeze([...names.keys()]);
    } else if (selection !== "*") {
      syntax = Object.freeze(Object.fromEntries(aliases));
    }

    return { names, syntax };
  });

interface Capability extends Relocatable<Capability> {}
type Rebindings<E> = { readonly [K in keyof E]: Relocatable<E[K]> };

/** A module whose exports each rebind to their own type, as an import requires. */
export interface Rebindable<M extends Module.Any> {
  readonly modules: M["modules"] & Rebindings<M["modules"]>;
  readonly types: M["types"] & Rebindings<M["types"]>;
  readonly values: M["values"] & Rebindings<M["values"]>;
}

/** Rebinds each value at its original E[K] type before asserting the renamed table. */
const select = <E extends ReadonlyRecord<string, Capability>, I>(
  entries: E & Rebindings<E>,
  names: Plan["names"],
): Result.Result<Selected<E, I>, ProgramError.Construction> =>
  Result.gen(function* () {
    const selected: Partial<Selected<E, I>> = {};
    const sources: Rebindings<E> = entries;
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- K retains the original producer result E[K] before the alias changes its key
    const member = <K extends keyof E & string>(
      name: K,
      {
        alias,
        ident,
      }: { readonly alias: string; readonly ident: JExpr.Ident.Ident },
    ): Result.Result<Partial<Selected<E, I>>, ProgramError.Construction> =>
      pipe(
        relocate<E[K]>(sources[name], { rooted: false, segments: [ident] }),
        Result.map((value) =>
          Object.defineProperty(selected, alias, {
            value,
            enumerable: true,
            configurable: true,
          }),
        ),
      );

    for (const name of Object.getOwnPropertyNames(entries)) {
      const ident = names.get(name);
      if (ident !== undefined) {
        yield* member(name, ident);
      }
    }

    // SAFETY: Plan selects the requested source names and aliases; member retains E[K] for each selected key, including non-enumerable own exports.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot express this key remapping through Object.defineProperty
    return Object.freeze(selected) as Selected<E, I>;
  });

export interface Declaration<M extends Module.Any, I> {
  readonly scope: Imported<M, I> & Namespace.Rebindable<Imported<M, I>>;
  readonly wrap: (child: AST.Node) => AST.Node;
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the module and selection construct a declaration
export const bind = <M extends Module.Any, const I extends Selection<M>>(
  module: M & Rebindable<M>,
  selection: I,
): Result.Result<Declaration<M, I>, ProgramError.Construction> =>
  Result.gen(function* () {
    const selected = yield* plan(module, selection);
    const scope: Imported<M, I> = yield* Result.all({
      modules: select<M["modules"], I>(module.modules, selected.names),
      types: select<M["types"], I>(module.types, selected.names),
      values: select<M["values"], I>(module.values, selected.names),
    });

    return {
      // SAFETY: every selected member came from a producer checked by Rebindable<M>, and its own relocation returns that same capability.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mapped selections retain the producer bound that TypeScript cannot distribute through Selected
      scope: scope as Imported<M, I> & Namespace.Rebindable<Imported<M, I>>,
      wrap: (child: AST.Node): AST.Node =>
        new AST.Import(module.path, selected.syntax, child),
    };
  });
