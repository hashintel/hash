import {
  Array,
  Context,
  Effect,
  Layer,
  MutableHashMap,
  MutableHashSet,
  Option,
  flow,
} from "effect";
import * as Syntax from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as ParseError from "../AST/ParseError.js";
import * as TypeScript from "../TypeScript/index.js";

import type { Cause } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

export interface ExportBinding {
  readonly symbol: CompilerSymbol;
  readonly typeOnlyExport: boolean;
}

interface Binding {
  readonly symbol: CompilerSymbol;
  readonly edges: { readonly target: Binding; readonly typeOnly: boolean }[];
  present: boolean;
  unrestricted: boolean;
}

const containerOf = (node: Syntax.Node): Syntax.Node => {
  let parent = node.parent;

  while (
    !Syntax.isSourceFile(parent) &&
    !Syntax.isModuleDeclaration(parent) &&
    !Syntax.isClassDeclaration(parent) &&
    !Syntax.isInterfaceDeclaration(parent) &&
    !Syntax.isEnumDeclaration(parent) &&
    !Syntax.isFunctionDeclaration(parent) &&
    !Syntax.isTypeAliasDeclaration(parent)
  ) {
    parent = parent.parent;
  }

  return parent;
};

const statementsOf = (
  node: Syntax.SourceFile | Syntax.ModuleDeclaration,
): readonly Syntax.Statement[] => {
  if (Syntax.isSourceFile(node)) {
    return node.statements;
  }

  if (node.body === undefined) {
    return [];
  }

  if (Syntax.isModuleBlock(node.body)) {
    return node.body.statements;
  }

  return [node.body];
};

const statementOf = (
  node: Syntax.Node,
): Option.Option<Syntax.ImportDeclaration | Syntax.ExportDeclaration> => {
  let current = node;

  while (!Syntax.isSourceFile(current)) {
    if (
      Syntax.isImportDeclaration(current) ||
      Syntax.isExportDeclaration(current)
    ) {
      return Option.some(current);
    }

    current = current.parent;
  }

  return Option.none();
};

const restricted = (node: Syntax.Node): boolean => {
  if (Syntax.isExportSpecifier(node) || Syntax.isImportSpecifier(node)) {
    return node.isTypeOnly || restricted(node.parent.parent);
  }

  if (Syntax.isNamespaceExport(node) || Syntax.isNamespaceImport(node)) {
    return restricted(node.parent);
  }

  if (
    Syntax.isExportDeclaration(node) ||
    Syntax.isImportEqualsDeclaration(node)
  ) {
    return node.isTypeOnly;
  }

  if (Syntax.isImportClause(node)) {
    return node.phaseModifier === Syntax.SyntaxKind.TypeKeyword;
  }

  if (Syntax.isImportDeclaration(node)) {
    return node.importClause?.phaseModifier === Syntax.SyntaxKind.TypeKeyword;
  }

  return false;
};

const importedFrom = (
  node: Syntax.Node,
): Option.Option<{
  readonly module: Syntax.Expression;
  readonly name: string;
}> => {
  const statement = statementOf(node);

  if (Option.isNone(statement)) {
    return Option.none();
  }

  if (
    Syntax.isExportSpecifier(node) &&
    Syntax.isExportDeclaration(statement.value) &&
    statement.value.moduleSpecifier !== undefined
  ) {
    return Option.some({
      module: statement.value.moduleSpecifier,
      name: (node.propertyName ?? node.name).text,
    });
  }

  if (Syntax.isImportDeclaration(statement.value)) {
    if (Syntax.isImportSpecifier(node)) {
      return Option.some({
        module: statement.value.moduleSpecifier,
        name: (node.propertyName ?? node.name).text,
      });
    }

    if (Syntax.isImportClause(node) && node.name !== undefined) {
      return Option.some({
        module: statement.value.moduleSpecifier,
        name: "default",
      });
    }
  }

  return Option.none();
};

const isStarExport = (
  node: Syntax.Statement,
): node is Syntax.ExportDeclaration & {
  readonly moduleSpecifier: Syntax.Expression;
} =>
  Syntax.isExportDeclaration(node) &&
  node.exportClause === undefined &&
  node.moduleSpecifier !== undefined;

/** Export restrictions belong to paths through modules, not to the declaration symbol at their end. */
export class Exposure extends Context.Service<Exposure, Exposure.Shape>()(
  "@local/hashql-docs/internal/ast-exposure/Exposure",
) {}

export declare namespace Exposure {
  export interface Shape extends Effect.Success<typeof make> {}
}

interface ExposureBindings {
  readonly modules: MutableHashMap.MutableHashMap<
    number,
    MutableHashMap.MutableHashMap<string, Binding>
  >;
  readonly symbols: MutableHashMap.MutableHashMap<number, Binding>;
  readonly all: Binding[];
}
class ExposureState extends Context.Service<ExposureState, ExposureBindings>()(
  "@local/hashql-docs/internal/ast-exposure/ExposureState",
) {}

type Requirements =
  | ExposureState
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program;

type Failure = Cause.UnknownError | ParseError.ParseError;

const makeBinding = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  const { all } = yield* ExposureState;
  const binding: Binding = {
    symbol,
    edges: [],
    present: false,
    unrestricted: false,
  };
  all.push(binding);

  return binding;
});

const moduleAt = Effect.fnUntraced(function* (
  node: Syntax.Node,
): Effect.fn.Return<
  MutableHashMap.MutableHashMap<string, Binding>,
  Failure,
  Requirements
> {
  const checker = yield* TypeScript.Checker.Checker;
  const [found] = yield* checker.getSymbolAtLocation([node]);

  if (found === undefined || Option.isNone(found)) {
    return yield* ParseError.unresolvedReference({
      file: node.getSourceFile().fileName,
      text: node.getText(),
    });
  }

  // oxlint-disable-next-line no-use-before-define -- Module imports recurse through this lookup; neither operation runs during module initialization.
  return yield* moduleBindings(found.value);
});

const alias = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
): Effect.fn.Return<Binding, Failure, Requirements> {
  const { symbols } = yield* ExposureState;
  const checker = yield* TypeScript.Checker.Checker;
  const program = yield* TypeScript.Program.Program;
  const existing = MutableHashMap.get(symbols, symbol.id);

  if (Option.isSome(existing)) {
    return existing.value;
  }

  const binding = yield* makeBinding(symbol);
  binding.present = true;
  MutableHashMap.set(symbols, symbol.id, binding);
  const nodes = yield* program.declarations(symbol);

  if (Array.some(nodes, restricted)) {
    return binding;
  }

  for (const node of nodes) {
    const imported = importedFrom(node);

    if (Option.isSome(imported)) {
      const exports = yield* moduleAt(imported.value.module);
      const target = MutableHashMap.get(exports, imported.value.name);

      if (Option.isSome(target)) {
        binding.edges.push({ target: target.value, typeOnly: false });
      }

      return binding;
    }

    if (Syntax.isNamespaceExport(node) || Syntax.isNamespaceImport(node)) {
      binding.unrestricted = true;

      return binding;
    }
  }

  if (TypeScript.Symbol.hasFlag(symbol, SymbolFlags.Alias)) {
    const immediate = yield* checker.getImmediateAliasedSymbol(symbol);

    if (Option.isSome(immediate)) {
      const target = yield* alias(immediate.value);
      binding.edges.push({ target, typeOnly: false });
    }
  } else {
    binding.unrestricted = true;
  }

  return binding;
});

const moduleBindings = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
): Effect.fn.Return<
  MutableHashMap.MutableHashMap<string, Binding>,
  Failure,
  Requirements
> {
  const { modules } = yield* ExposureState;
  const checker = yield* TypeScript.Checker.Checker;
  const program = yield* TypeScript.Program.Program;
  const existing = MutableHashMap.get(modules, symbol.id);

  if (Option.isSome(existing)) {
    return existing.value;
  }

  const exported = yield* checker.getExportsOfModule(symbol);
  const entries = yield* Effect.forEach(
    exported,
    Effect.fnUntraced(function* (item) {
      const binding = yield* makeBinding(item);

      return [item.name, binding] as const;
    }),
  );

  const bindings = MutableHashMap.fromIterable(entries);
  MutableHashMap.set(modules, symbol.id, bindings);

  const declarations: readonly Syntax.Node[] =
    yield* program.declarations(symbol);
  const sources = Array.filter(
    declarations,
    (node): node is Syntax.SourceFile | Syntax.ModuleDeclaration =>
      Syntax.isSourceFile(node) || Syntax.isModuleDeclaration(node),
  );

  const explicit = MutableHashSet.empty<string>();

  for (const [name, binding] of bindings) {
    const nodes = yield* program.declarations(binding.symbol);

    if (
      Array.some(nodes, (node) => {
        const container = containerOf(node);

        return Array.some(sources, (source) => source === container);
      })
    ) {
      MutableHashSet.add(explicit, name);

      binding.present = true;

      const target = yield* alias(binding.symbol);
      binding.edges.push({ target, typeOnly: false });
    }
  }

  const stars = Array.filter(
    Array.flatMap(sources, statementsOf),
    isStarExport,
  );

  for (const statement of stars) {
    const inherited = yield* moduleAt(statement.moduleSpecifier);

    for (const [name, binding] of bindings) {
      const target = MutableHashMap.get(inherited, name);

      if (
        name !== "default" &&
        !MutableHashSet.has(explicit, name) &&
        Option.isSome(target)
      ) {
        const selected = yield* TypeScript.Checker.resolveAlias(binding.symbol);
        const inheritedSymbol = yield* TypeScript.Checker.resolveAlias(
          target.value.symbol,
        );

        if (selected.id === inheritedSymbol.id) {
          binding.edges.push({
            target: target.value,
            typeOnly: statement.isTypeOnly,
          });
        }
      }
    }
  }

  return bindings;
});

const exportsImpl = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
): Effect.fn.Return<readonly ExportBinding[], Failure, Requirements> {
  const { all } = yield* ExposureState;
  const bindings = yield* moduleBindings(symbol);
  let changed = true;

  while (changed) {
    changed = false;

    for (const binding of all) {
      const present =
        binding.present || binding.edges.some(({ target }) => target.present);
      const unrestricted =
        binding.unrestricted ||
        binding.edges.some(
          ({ target, typeOnly }) => !typeOnly && target.unrestricted,
        );

      if (
        present !== binding.present ||
        unrestricted !== binding.unrestricted
      ) {
        binding.present = present;
        binding.unrestricted = unrestricted;
        changed = true;
      }
    }
  }

  return Array.fromIterable(MutableHashMap.values(bindings))
    .filter((binding) => binding.present)
    .map((binding) => ({
      symbol: binding.symbol,
      typeOnlyExport: !binding.unrestricted,
    }));
});

const make = Effect.context<
  TypeScript.Checker.Checker | TypeScript.Program.Program
>().pipe(
  Effect.map((services) => {
    const bindings: ExposureBindings = {
      modules: MutableHashMap.empty(),
      symbols: MutableHashMap.empty(),
      all: [],
    };
    const context = Context.add(services, ExposureState, bindings);

    return { exports: flow(exportsImpl, Effect.provide(context)) };
  }),
);

export const layer = Layer.effect(Exposure, make);

/** The names `symbol`'s module exports, each with whether every path to it restricts it to type-only use. */
export const exports = (
  symbol: CompilerSymbol,
): Effect.Effect<readonly ExportBinding[], Failure, Exposure> =>
  Effect.flatMap(Exposure, (exposure) => exposure.exports(symbol));
