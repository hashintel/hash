/**
 * Typed lexical imports shared by the authoring APIs.
 *
 * Selection changes local names, not the declared types or callable capabilities. Each selected producer rebinds itself before the namespace join. The compiler remains responsible for resolving the emitted import.
 *
 * @module
 */
import {
  Array,
  Iterable,
  Option,
  Record,
  Result,
  SchemaParser,
  pipe,
} from "effect";

import { isReadonlyArray } from "../../internal/array.js";
import { relocate } from "../../internal/relocation.js";
import * as JExpr from "../../JExpr/index.js";
import * as AST from "../AST/index.js";
import * as ProgramError from "../ProgramError.js";
import * as Bindings from "./Bindings.js";

import type * as Relocation from "../../internal/relocation.js";
import type * as Module from "../Module.js";
import type * as Namespace from "../Namespace.js";

/** Marker for a lexical import declaration, distinct from its bindings. */
export type TypeId = "~hashql/Import";
const TypeId: TypeId = "~hashql/Import";

/** The bindings an import adds to a scope, with the source module and selection that produced them. */
export * as Bindings from "./Bindings.js";

/**
 * The exports an import brings into scope and the local names they take.
 *
 * - `"*"` imports every enumerable own name in the module's three tables.
 * - An array of export names imports those names unchanged.
 * - A record maps enumerable own export names to local aliases. The alias `"_"` keeps the export's own name.
 *
 * `K` chooses which record keys to check and defaults to all module export names. {@link bind} infers the supplied keys, so omitted names such as `constructor` do not constrain inherited Object members. For an explicit partial-record annotation on such a module, supply its selected keys as `K`.
 *
 * Literal selections retain required exports. A widened array, an optional record entry or a union alias can leave a name absent, so its result entry is optional. The `"_"` alternative contributes the source name rather than a literal underscore key. Selection unions retain all possible names but require only names present in every alternative.
 *
 * One name selects the module, type and value exports that share it. Each imported export emits its local name, and the import wraps the expression built in its scope in a `use` of the module's path. An alias that is not a HashQL identifier, or an enumerable symbol key in the record, fails construction with `InvalidImportName`.
 *
 * @example <caption>Import a built-in function under another name.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression, Import, Namespace, Prelude } = Program;
 * const { math } = Prelude.builtin.modules;
 * const imported = Result.getOrThrow(Import.bind(math, { add: "plus" }));
 * const { plus } = Namespace.flatten(imported.scope);
 * const result = Result.map(Expression.toNode(plus(1n, 2n)), imported.wrap);
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Result.map(result, (node) => node.compile()))),
 *   '["::kernel::special_form::use","::core::math",{"#struct":{"add":"plus"}},["plus",{"#literal":1},{"#literal":2}]]',
 * );
 *
 * const invalid = Import.bind(math, { add: "not an identifier" });
 * assert.ok(Result.isFailure(invalid));
 * assert.equal(invalid.failure.reason._tag, "InvalidImportName");
 * ```
 */
export type Selection<
  M extends Module.Module.Any,
  K extends string | number = Module.Module.Items<M>,
> =
  | "*"
  | readonly Module.Module.Items<M>[]
  | {
      readonly [Name in K]?: Name extends Module.Module.Items<M>
        ? string
        : never;
    };

export declare namespace Selection {
  /** Checks every union member against that member's record keys rather than the union's shared keys. */
  type Valid<M extends Module.Module.Any, I> =
    I extends Selection<M, keyof I & (string | number)> ? I : never;
}

/** A validated local name and its parsed identifier. */
interface Alias {
  readonly alias: string;
  readonly ident: JExpr.Ident.Ident;
}

/** Validated source-to-local names and the matching import syntax. */
interface Plan {
  readonly names: Record.ReadonlyRecord<string, Alias>;
  readonly syntax: JExpr.Imports;
}

const decodeName = SchemaParser.decodeUnknownResult(JExpr.Ident.Schema);

/** Validates a local name, retaining the schema issue on failure. */
const importName = (
  name: string | undefined,
): Result.Result<JExpr.Ident.Ident, ProgramError.Construction> =>
  pipe(
    decodeName(name),
    Result.mapError((cause) =>
      ProgramError.Construction.invalidImportName(String(name), cause),
    ),
  );

/** A selected source name and its not-yet-validated alias. */
interface Request {
  readonly name: string;
  readonly alias: string | undefined;
}

/** Enumerates the selection's source names using enumerable own record entries. */
const requests = (
  module: Module.Module.Any,
  selection: Selection<Module.Module.Any>,
): Iterable<Request> => {
  if (selection === "*") {
    return pipe(
      [
        Record.keys(module.modules),
        Record.keys(module.types),
        Record.keys(module.values),
      ],
      Iterable.flatten<string>,
      (names) => new Set(names),
      Iterable.map((name) => ({ name, alias: name })),
    );
  }

  if (isReadonlyArray(selection)) {
    return pipe(
      selection,
      Array.map((name) => ({ name, alias: name })),
    );
  }

  return pipe(
    Record.toEntries(selection),
    Array.map(([name, alias]) => {
      if (alias === "_") {
        return { name, alias: name };
      }

      return { name, alias };
    }),
  );
};

/** Validates aliases before any relocation and snapshots the emitted selection. */
const plan = (
  module: Module.Module.Any,
  selection: Selection<Module.Module.Any>,
): Result.Result<Plan, ProgramError.Construction> =>
  Result.gen(function* () {
    const names: Record<string, Alias> = {};

    const aliases: [string, string][] = [];
    for (const { name, alias } of requests(module, selection)) {
      const ident = yield* importName(alias);
      Object.defineProperty(names, name, {
        value: { alias: String(alias), ident },
        enumerable: true,
        configurable: true,
      });

      aliases.push([name, JExpr.Ident.compile(ident)]);
    }

    if (typeof selection === "object") {
      for (const name of Object.getOwnPropertySymbols(selection)) {
        if (Object.prototype.propertyIsEnumerable.call(selection, name)) {
          yield* importName(String(name));
        }
      }
    }

    let syntax: JExpr.Imports = "*";
    if (isReadonlyArray(selection)) {
      syntax = Object.freeze(Record.keys(names));
    } else if (selection !== "*") {
      syntax = Object.freeze(Object.fromEntries(aliases));
    }

    return { names: Object.freeze(names), syntax };
  });

interface Capability extends Relocation.Relocatable<Capability> {}
type Rebindings<E> = { readonly [K in keyof E]: Relocation.Relocatable<E[K]> };

/** A module whose exports each rebind to their own type, as an import requires. */
export interface Rebindable<M extends Module.Module.Any> {
  readonly modules: M["modules"] & Rebindings<M["modules"]>;
  readonly types: M["types"] & Rebindings<M["types"]>;
  readonly values: M["values"] & Rebindings<M["values"]>;
}

/** Rebinds each value at its original E[K] type before asserting the renamed table. */
const select = <E extends Record.ReadonlyRecord<string, Capability>, I>(
  entries: E & Rebindings<E>,
  names: Plan["names"],
): Result.Result<Bindings.Selected<E, I>, ProgramError.Construction> =>
  Result.gen(function* () {
    const selected: Partial<Bindings.Selected<E, I>> = {};
    const sources: Rebindings<E> = entries;
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- K retains the original producer result E[K] before the alias changes its key
    const member = <K extends keyof E & string>(
      name: K,
      { alias, ident }: Alias,
    ): Result.Result<
      Partial<Bindings.Selected<E, I>>,
      ProgramError.Construction
    > =>
      pipe(
        relocate<E[K]>(
          sources[name],
          JExpr.Path.make({
            rooted: false,
            segments: [{ name: ident, arguments: [] }],
          }),
        ),
        Result.map((value) =>
          Object.defineProperty(selected, alias, {
            value,
            enumerable: true,
            configurable: true,
          }),
        ),
      );

    for (const name of Record.keys(entries)) {
      const alias = Record.get(names, name);
      if (Option.isSome(alias)) {
        yield* member(name, alias.value);
      }
    }

    // SAFETY: Plan selects the requested source names and aliases. Member retains E[K] for each selected key. Export and selection records use enumerable own entries.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot express this key remapping through Object.defineProperty
    return Object.freeze(selected) as Bindings.Selected<E, I>;
  });

/** An import's bindings and the lexical wrapper that makes their local names available. */
export interface Declaration<M extends Module.Module.Any, I> {
  readonly [TypeId]: TypeId;
  readonly scope: Bindings.Bindings<M, I> &
    Namespace.Rebindable<Bindings.Bindings<M, I>>;
  readonly wrap: (child: AST.Node) => AST.Node;
}

/** Selects all three tables with one plan and marks them as the module's bindings. */
const selectBindings = <M extends Module.Module.Any, I>(
  module: M & Rebindable<M>,
  names: Plan["names"],
): Result.Result<Declaration<M, I>["scope"], ProgramError.Construction> =>
  Result.gen(function* () {
    const tables = yield* Result.all({
      modules: select<M["modules"], I>(module.modules, names),
      types: select<M["types"], I>(module.types, names),
      values: select<M["values"], I>(module.values, names),
    });

    // SAFETY: every selected member came from a producer checked by Rebindable<M>, and its own relocation returns that same capability.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mapped selections retain the producer bound that TypeScript cannot distribute through Selected
    return Bindings.make<M, I>(tables) as Declaration<M, I>["scope"];
  });

/** Owns the import's bindings and a callback that retains its lexical import when passed on its own. */
class ImportImpl<M extends Module.Module.Any, I> implements Declaration<M, I> {
  readonly [TypeId]: TypeId = TypeId;
  readonly scope: Declaration<M, I>["scope"];
  readonly wrap: Declaration<M, I>["wrap"];

  constructor(
    path: JExpr.Path.Path,
    syntax: JExpr.Imports,
    scope: Declaration<M, I>["scope"],
  ) {
    this.scope = scope;
    this.wrap = (child): AST.Node => new AST.Import(path, syntax, child);
    Object.freeze(this);
  }
}

/**
 * Selects exports and rebinds each producer to its local name without changing the source module.
 *
 * Records must expose their declared entries as enumerable own properties. Non-enumerable and inherited entries select nothing. Returns a construction failure for invalid aliases or enumerable symbol keys, or propagates a producer's relocation failure. Omitted alias entries select nothing. A present entry must contain a valid identifier or the `"_"` sentinel, not `undefined`. The operation freezes the returned tables, and the compiler resolves their emitted import.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the module and selection construct a declaration
export const bind = <
  M extends Module.Module.Any,
  const I extends Selection<M, keyof I & (string | number)>,
>(
  module: M & Rebindable<M>,
  selection: I & Selection.Valid<M, I>,
): Result.Result<Declaration<M, I>, ProgramError.Construction> =>
  Result.gen(function* () {
    const selected = yield* plan(module, selection);

    const scope = yield* selectBindings<M, I>(module, selected.names);
    return new ImportImpl<M, I>(module.path, selected.syntax, scope);
  });
