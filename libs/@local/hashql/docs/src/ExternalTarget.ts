import { Array, Effect, HashMap, Option, pipe } from "effect";
import {
  SyntaxKind,
  isClassLikeDeclaration,
  isExpressionWithTypeArguments,
  isHeritageClause,
  isModuleDeclaration,
  isPropertyAccessExpression,
  isQualifiedName,
  isSourceFile,
  isTypeNode,
  isTypeQueryNode,
  isVariableStatement,
} from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as Checker from "./TypeScript/Checker.js";
import * as Program from "./TypeScript/Program.js";
import { hasFlag } from "./TypeScript/Symbol.js";

import type { Cause } from "effect";
import type { Node } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

/** Effect's API reference, one page per module. */
const site = "https://effect.website/docs/v4/api/effect/";

// Effect's reference documents the modules at the top of `dist`, so a file in a directory below it, such as `internal/`, has no page.
const modulePattern = /\/node_modules\/effect\/dist\/(?<module>[^/]+)\.d\.ts$/u;

/** The module of Effect's that `file` declares, such as `Equal`, which qualifies the names in it, as in `Equal.Equal`. */
export const effectModuleOf = (file: string): Option.Option<string> =>
  Option.fromNullishOr(modulePattern.exec(file)?.groups?.["module"]);

// TypeScript's own declarations of JavaScript and the web, such as `lib.es5.d.ts` and `lib.dom.d.ts`.
const libraryPattern = /\/lib\/lib\.(?<library>[^/]+)\.d\.ts$/u;

/** The section of TypeScript's handbook that explains each utility type. */
const utilityTypes: HashMap.HashMap<string, string> = HashMap.make(
  ["Awaited", "awaitedtype"],
  ["Capitalize", "capitalizestringtype"],
  ["ConstructorParameters", "constructorparameterstype"],
  ["Exclude", "excludeuniontype-excludedmembers"],
  ["Extract", "extracttype-union"],
  ["InstanceType", "instancetypetype"],
  ["Lowercase", "lowercasestringtype"],
  ["NoInfer", "noinfertype"],
  ["NonNullable", "nonnullabletype"],
  ["Omit", "omittype-keys"],
  ["OmitThisParameter", "omitthisparametertype"],
  ["Parameters", "parameterstype"],
  ["Partial", "partialtype"],
  ["Pick", "picktype-keys"],
  ["Readonly", "readonlytype"],
  ["Record", "recordkeys-type"],
  ["Required", "requiredtype"],
  ["ReturnType", "returntypetype"],
  ["ThisParameterType", "thisparametertypetype"],
  ["ThisType", "thistypetype"],
  ["Uncapitalize", "uncapitalizestringtype"],
  ["Uppercase", "uppercasestringtype"],
);

/** The global an interface of TypeScript's describes, where its name is not the global's own. A constructor's interface, such as `BigIntConstructor`, describes the global it constructs. */
const globalOf = (name: string): string => {
  switch (name) {
    case "ReadonlyArray":
    case "ArrayLike": {
      return "Array";
    }
    case "ReadonlyMap": {
      return "Map";
    }
    case "ReadonlySet": {
      return "Set";
    }
    case "PromiseLike": {
      return "Promise";
    }
    default: {
      return name.replace(/Constructor$/u, "");
    }
  }
};

/** What a name means where it stands, which picks among the declarations that share it. */
export type Meaning = "type" | "value" | "namespace";

const meanings: Readonly<Record<Meaning, readonly SyntaxKind[]>> = {
  type: [
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.EnumDeclaration,
  ],
  value: [
    SyntaxKind.VariableDeclaration,
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.EnumDeclaration,
  ],
  namespace: [SyntaxKind.ModuleDeclaration],
};

/** The kind an anchor on Effect's pages names, by declaration. */
const anchorKinds = HashMap.make<readonly (readonly [SyntaxKind, string])[]>(
  [SyntaxKind.TypeAliasDeclaration, "type"],
  [SyntaxKind.InterfaceDeclaration, "interface"],
  [SyntaxKind.ModuleDeclaration, "namespace"],
  [SyntaxKind.VariableDeclaration, "variable"],
  [SyntaxKind.FunctionDeclaration, "function"],
  [SyntaxKind.ClassDeclaration, "class"],
  [SyntaxKind.EnumDeclaration, "enum"],
);

/**
 * What `name` means in the declaration around it.
 *
 * A name before a dot is a namespace. A name after `typeof`, or in a class's `extends` clause, is a value. Type syntax and an interface's heritage clause select the type meaning. Other occurrences select the value meaning.
 */
export const meaning = (name: Node): Meaning => {
  // The dotted name that ends in `name`, such as `$Schema.Schema` for the second name in `$Schema.Schema.Type`.
  let dotted = name;
  if (
    (isQualifiedName(name.parent) && name.parent.right === name) ||
    (isPropertyAccessExpression(name.parent) && name.parent.name === name)
  ) {
    dotted = name.parent;
  }

  const { parent } = dotted;
  if (
    (isQualifiedName(parent) && parent.left === dotted) ||
    (isPropertyAccessExpression(parent) && parent.expression === dotted)
  ) {
    return "namespace";
  }

  let node = parent;
  while (
    isQualifiedName(node) ||
    isPropertyAccessExpression(node) ||
    isExpressionWithTypeArguments(node)
  ) {
    node = node.parent;
  }

  if (isTypeQueryNode(node)) {
    return "value";
  }
  if (
    isHeritageClause(node) &&
    node.token === SyntaxKind.ExtendsKeyword &&
    isClassLikeDeclaration(node.parent)
  ) {
    return "value";
  }

  return isTypeNode(node) || isHeritageClause(node) ? "type" : "value";
};

/** The page of the module that declares `node`, when it is one of Effect's. */
const pageOf = (node: Node): Option.Option<string> =>
  pipe(
    node.getSourceFile().fileName,
    effectModuleOf,
    Option.map((module) => `${site}${module}`),
  );

/** The declaration at the top of its file that holds `node`, such as the namespace around a namespace's member. */
const topOf = (node: Node): Node => {
  let top = node;
  while (!isSourceFile(top.parent)) {
    top = top.parent;
  }

  // A `const` names its declaration, and the statement around it names nothing.
  if (isVariableStatement(top)) {
    return pipe(
      top.declarationList.declarations,
      Array.head,
      Option.getOrElse((): Node => top),
    );
  }

  return top;
};

/**
 * The page for `declaration`, one of TypeScript's own for `symbol` in the library `library`: the handbook's section for a utility type, and MDN's page for a JavaScript global or a web API.
 *
 * MDN gives a page to each global a program can name. A declaration at the top of its file has that page when its name is the global's, or when it describes the global, as `ReadonlyArray` describes `Array`.
 */
const libraryPageOf = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
  declaration: Node,
  library: string,
): Effect.fn.Return<Option.Option<URL>, Cause.UnknownError, Checker.Checker> {
  if (topOf(declaration) !== declaration) {
    return Option.none();
  }

  const utility = HashMap.get(utilityTypes, symbol.name);
  if (Option.isSome(utility)) {
    return Option.some(
      new URL(
        `https://www.typescriptlang.org/docs/handbook/utility-types.html#${utility.value}`,
      ),
    );
  }

  const checker = yield* Checker.Checker;
  const global = globalOf(symbol.name);
  let described = Option.some(symbol);

  if (global !== symbol.name) {
    described = yield* checker.resolveName(global, declaration);
  }

  if (!Option.exists(described, hasFlag(SymbolFlags.Value))) {
    return Option.none();
  }

  const section = library.startsWith("dom")
    ? "Web/API"
    : "Web/JavaScript/Reference/Global_Objects";

  return Option.some(
    new URL(`https://developer.mozilla.org/en-US/docs/${section}/${global}`),
  );
});

type Handle = CompilerSymbol["declarations"][number];

/** The declaration of `symbol` a name with `reading` means, or its first declaration when none has that meaning. */
const handleOf = (
  symbol: CompilerSymbol,
  reading: Meaning,
): Option.Option<Handle> =>
  pipe(
    symbol.declarations,
    Array.findFirst((declaration) =>
      meanings[reading].includes(declaration.kind),
    ),
    Option.orElse(() => Array.head(symbol.declarations)),
  );

/** The page that documents `handle`, one of `symbol`'s declarations. */
const pageOfHandle = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
  handle: Handle,
): Effect.fn.Return<
  Option.Option<URL>,
  Cause.UnknownError,
  Program.Program | Checker.Checker
> {
  const program = yield* Program.Program;
  const checker = yield* Checker.Checker;

  const resolved = yield* program.resolve(handle);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  const declaration = resolved.value;
  const library = libraryPattern.exec(declaration.getSourceFile().fileName)
    ?.groups?.["library"];
  if (library !== undefined) {
    return yield* libraryPageOf(symbol, declaration, library);
  }

  const page = pageOf(declaration);
  if (Option.isNone(page) || isSourceFile(declaration)) {
    return Option.map(page, (href) => new URL(href));
  }

  const top = topOf(declaration);
  if (top !== declaration && !isModuleDeclaration(top)) {
    return Option.none();
  }

  const owner = yield* checker.getSymbolOfNode(top);
  const kind = HashMap.get(anchorKinds, top.kind);
  if (Option.isNone(owner) || Option.isNone(kind)) {
    return Option.some(new URL(page.value));
  }

  const { name, declarations } = owner.value;
  const kinds = pipe(
    declarations,
    Array.map((declared) => HashMap.get(anchorKinds, declared.kind)),
    Array.dedupe,
  );

  let anchor = name;
  if (kinds.length > 1) {
    anchor = `${name}-${kind.value}`;
  }

  return Option.some(new URL(`${page.value}#${anchor}`));
});

/**
 * The page that documents `symbol` for each meaning a name can read it with.
 *
 * Effect's symbols have pages on effect.website, and TypeScript's own declarations have pages on MDN or in TypeScript's handbook. A symbol none of them documents has no page.
 *
 * A module links to its page, and a declaration at the top of a module's file to its section of the page. A namespace's member links to the namespace, whose section names its members. The pages do not document the members of an interface or a class, so those have no link. When declarations of different kinds share a name, as the `Option` type and namespace do, each meaning has its own section, and its anchor carries the kind, as in `#Option-type`. Meanings that pick the same declaration share its page.
 */
export const pages = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
): Effect.fn.Return<
  Readonly<Record<Meaning, Option.Option<URL>>>,
  Cause.UnknownError,
  Program.Program | Checker.Checker
> {
  const found = new Map<Handle, Option.Option<URL>>();

  const pageFor = Effect.fnUntraced(function* (reading: Meaning) {
    const handle = handleOf(symbol, reading);
    if (Option.isNone(handle)) {
      return Option.none<URL>();
    }

    const existing = found.get(handle.value);
    if (existing !== undefined) {
      return existing;
    }

    const page = yield* pageOfHandle(symbol, handle.value);
    found.set(handle.value, page);

    return page;
  });

  return {
    type: yield* pageFor("type"),
    value: yield* pageFor("value"),
    namespace: yield* pageFor("namespace"),
  };
});
