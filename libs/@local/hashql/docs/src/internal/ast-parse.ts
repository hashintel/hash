// oxlint-disable import/max-dependencies -- The parser composes every AST service into one layer.
import {
  Array,
  Chunk,
  Context,
  Effect,
  Layer,
  MutableHashMap,
  Option,
  flow,
  pipe,
} from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as Catalogue from "../Catalogue.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Comments from "./ast-comments.js";
import * as DeclarationParser from "./ast-declarations.js";
import * as Examples from "./ast-examples.js";
import * as Exposure from "./ast-exposure.js";
import * as Heritage from "./ast-heritage.js";
import * as Links from "./ast-links.js";
import * as References from "./ast-references.js";
import * as Targets from "./ast-targets.js";
import * as TypeParser from "./ast-types.js";

import type { Failure } from "./ast-context.js";
import type { Symbol as CompilerSymbol } from "typescript/async";

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

const localDeclarations: (
  node: Syntax.SourceFile | Syntax.ModuleDeclaration,
) => readonly Syntax.Declaration[] = flow(
  statementsOf,
  Array.flatMap((statement): readonly Syntax.Declaration[] => {
    if (Syntax.isVariableStatement(statement)) {
      return statement.declarationList.declarations;
    }

    if (
      Syntax.isFunctionDeclaration(statement) ||
      Syntax.isClassDeclaration(statement) ||
      Syntax.isInterfaceDeclaration(statement) ||
      Syntax.isTypeAliasDeclaration(statement) ||
      Syntax.isEnumDeclaration(statement) ||
      Syntax.isModuleDeclaration(statement)
    ) {
      return [statement];
    }

    return [];
  }),
);

class ParserState extends Context.Service<
  ParserState,
  MutableHashMap.MutableHashMap<number, AST.Declaration.Interned>
>()("@local/hashql-docs/internal/ast-parse/ParserState") {}

type Requirements =
  | AST.Store
  | ParserState
  | Comments.CommentParser
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program
  | DeclarationParser.DeclarationParser
  | Exposure.Exposure
  | Heritage.Heritage
  | References.References
  | Targets.Targets;
type ParseDeclaration = (
  symbol: CompilerSymbol,
) => Effect.Effect<AST.Declaration.Interned, Failure, Requirements>;

const parseNamespace = (
  symbol: CompilerSymbol,
  node: Syntax.SourceFile | Syntax.ModuleDeclaration,
  parse: ParseDeclaration,
): Effect.Effect<AST.NamespaceDeclaration.Interned, Failure, Requirements> =>
  Effect.all({
    node: Effect.succeed(node),
    items: pipe(
      localDeclarations(node),
      Effect.forEach((local) =>
        TypeScript.Checker.getSymbolOfDeclaration(local).pipe(
          Effect.flatMap(parse),
        ),
      ),
      Effect.map(flow(Array.dedupe, Chunk.fromIterable)),
    ),
    exports: pipe(
      Exposure.exports(symbol),
      Effect.flatMap(
        Effect.forEach(({ symbol: alias, typeOnlyExport }) =>
          pipe(
            References.target(alias),
            Effect.flatMap(parse),
            Effect.map((target) =>
              AST.Alias.make({ name: alias.name, target, typeOnlyExport }),
            ),
            Effect.flatMap(AST.intern),
          ),
        ),
      ),
      Effect.map(Chunk.fromIterable),
    ),
    documentation: Comments.documentation(node),
  }).pipe(
    Effect.map(AST.NamespaceDeclaration.make),
    Effect.flatMap(AST.intern),
  );

const isNamespace = (
  node: Syntax.Declaration | Syntax.SourceFile,
): node is Syntax.SourceFile | Syntax.ModuleDeclaration =>
  Syntax.isSourceFile(node) || Syntax.isModuleDeclaration(node);

/** Every node declaring `symbol`. A declaration outside the program's project would leave a meaning out, so it fails the symbol. */
const declarationNodes = (
  symbol: CompilerSymbol,
): Effect.Effect<
  Array.NonEmptyReadonlyArray<Syntax.Declaration | Syntax.SourceFile>,
  Failure,
  Requirements
> =>
  pipe(
    symbol.declarations,
    Effect.forEach(TypeScript.Program.resolve),
    Effect.flatMap((resolved) => {
      const nodes = Option.all(resolved);

      if (Option.isSome(nodes) && Array.isReadonlyArrayNonEmpty(nodes.value)) {
        return Effect.succeed(nodes.value);
      }

      return Effect.fail(
        AST.ParseError.missingDeclaration({ name: symbol.name }),
      );
    }),
  );

/** The interfaces and classes `symbol` extends or implements directly. A base the package declares is parsed, so the hierarchy keeps the private types between public ones. */
const basesOf = (
  symbol: CompilerSymbol,
  parse: ParseDeclaration,
): Effect.Effect<
  readonly AST.Reference.Reference.Target[],
  Failure,
  Requirements
> =>
  pipe(
    Heritage.bases(symbol),
    Effect.flatMap(
      Effect.forEach(
        Effect.fnUntraced(function* (base) {
          if (yield* References.local(base)) {
            yield* parse(base);
          }

          return yield* Targets.target(base);
        }),
      ),
    ),
  );

/** A symbol's type and value meanings form its leaf, and at most one module or namespace declares its namespace meaning. */
const declarationOf = (
  symbol: CompilerSymbol,
  parse: ParseDeclaration,
): Effect.Effect<AST.Declaration.Declaration, Failure, Requirements> =>
  pipe(
    declarationNodes(symbol),
    Effect.tap(Effect.forEach(References.source, { discard: true })),
    Effect.flatMap((nodes) => {
      const namespaces = Array.filter(nodes, isNamespace);

      if (namespaces.length > 1) {
        return Effect.fail(
          AST.ParseError.unsupportedMerge({
            name: symbol.name,
            kinds: Array.map(nodes, (node) => Syntax.SyntaxKind[node.kind]),
          }),
        );
      }

      return Effect.all({
        leaf: DeclarationParser.parse(
          symbol,
          Array.filter(
            nodes,
            (node): node is Syntax.Declaration => !isNamespace(node),
          ),
        ),
        namespace: Effect.transposeOption(
          Option.map(Array.head(namespaces), (namespace) =>
            parseNamespace(symbol, namespace, parse),
          ),
        ),
        bases: basesOf(symbol, parse),
      });
    }),
    Effect.map((fields) => AST.Declaration.make({ symbol, ...fields })),
  );

/** Reserves a symbol's identity and binds the symbol to it before parsing, so its own declarations can refer to it. A symbol parses once. */
const declaration: ParseDeclaration = (symbol) =>
  Effect.flatMap(
    Effect.all({ store: AST.Store, declarations: ParserState }),
    ({
      store,
      declarations,
    }): Effect.Effect<AST.Declaration.Interned, Failure, Requirements> => {
      const existing = MutableHashMap.get(declarations, symbol.id);

      if (Option.isSome(existing)) {
        return Effect.succeed(existing.value);
      }

      const reservation = store.reserve<AST.Declaration.Declaration>();
      MutableHashMap.set(declarations, symbol.id, reservation.id);
      store.bindSymbol(symbol, reservation.id);

      return declarationOf(symbol, declaration).pipe(
        Effect.map((parsed) => {
          reservation.complete(parsed);

          return reservation.id;
        }),
      );
    },
  );

const entrypoint = (
  name: string,
  module: TypeScript.Module.Module,
  parse: (
    symbol: CompilerSymbol,
  ) => Effect.Effect<AST.Declaration.Interned, Failure, AST.Store>,
): Effect.Effect<void, Failure, TypeScript.Checker.Checker | AST.Store> =>
  TypeScript.Checker.getSymbolOfSourceFile(module.fileName).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(AST.ParseError.missingModule({ file: module.fileName })),
        onSome: parse,
      }),
    ),
    Effect.flatMap((id) =>
      Effect.map(AST.Store, (store) => {
        store.entrypoint(name, id);
      }),
    ),
  );

const references = References.layer.pipe(
  Layer.provideMerge(Targets.layer),
  Layer.provideMerge(Heritage.layer),
);

const types = TypeParser.layer.pipe(
  Layer.provideMerge(Comments.layer),
  Layer.provideMerge(references),
);

const services = Layer.merge(DeclarationParser.layer, Exposure.layer).pipe(
  Layer.provideMerge(types),
  Layer.provideMerge(
    Layer.merge(
      AST.layer,
      Layer.sync(ParserState, () => MutableHashMap.empty()),
    ),
  ),
);

/**
 * Builds all entrypoints together so references can cross module and namespace cycles, and returns the catalogue of their public names.
 *
 * Names resolve once every entrypoint is parsed. A comment's link the compiler does not bind resolves through the catalogue, and the examples compile last, in a program that stays open with the calling scope.
 */
export const parse = Effect.fn("Parser.parse")(
  function* (
    roots: Iterable<readonly [name: string, module: TypeScript.Module.Module]>,
  ) {
    // References resolve after every entrypoint, and may reach private declarations that need the same services.
    const parseDeclaration = flow(
      declaration,
      Effect.provide(yield* Effect.context<Requirements>()),
    );

    yield* Effect.forEach(
      roots,
      ([name, module]) => entrypoint(name, module, parseDeclaration),
      { discard: true },
    );
    yield* References.resolve(parseDeclaration);

    const store = yield* AST.Store;
    const catalogue = Catalogue.fromAST(store);
    yield* Links.resolve(catalogue);
    yield* Examples.resolve();
    store.finish();

    return catalogue;
  },
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- Each invocation owns fresh graph caches; no scoped compiler resource escapes.
  Effect.provide(services),
);
