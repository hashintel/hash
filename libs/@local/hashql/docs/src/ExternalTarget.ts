import { Array, Effect, HashMap, HashSet, Option, pipe } from "effect";
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

import * as Checker from "./TypeScript/Checker.js";
import * as Program from "./TypeScript/Program.js";

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

/** Names TypeScript declares that are types alone, which neither the handbook nor MDN documents. */
const undocumented = HashSet.make("PropertyKey");

/** The page for one of TypeScript's own declarations: the handbook's section for a utility type, and MDN's page for a JavaScript global or a web API. */
const libraryPageOf = (name: string, file: string): Option.Option<URL> =>
  pipe(
    libraryPattern.exec(file)?.groups?.["library"],
    Option.fromUndefinedOr,
    Option.flatMap((library) => {
      const utility = HashMap.get(utilityTypes, name);
      if (Option.isSome(utility)) {
        return Option.some(
          new URL(
            `https://www.typescriptlang.org/docs/handbook/utility-types.html#${utility.value}`,
          ),
        );
      }
      if (HashSet.has(undocumented, name)) {
        return Option.none();
      }

      const section = library.startsWith("dom")
        ? "Web/API"
        : "Web/JavaScript/Reference/Global_Objects";

      return Option.some(
        new URL(
          `https://developer.mozilla.org/en-US/docs/${section}/${globalOf(name)}`,
        ),
      );
    }),
  );

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
 * The page on effect.website that documents `symbol`, or on MDN or in TypeScript's handbook for one of TypeScript's own declarations, or none for a symbol neither declares.
 *
 * A module links to its page, and a declaration at the top of a module's file to its section of the page. A namespace's member links to the namespace, whose section names its members. The pages do not document the members of an interface or a class, so those have no link. When declarations of different kinds share a name, as the `Option` type and namespace do, the section is the one `reading` names, and its anchor carries the kind, as in `#Option-type`.
 */
export const resolve = Effect.fnUntraced(function* ({
  symbol,
  reading,
}: {
  readonly symbol: CompilerSymbol;
  readonly reading: Meaning;
}): Effect.fn.Return<
  Option.Option<URL>,
  Cause.UnknownError,
  Program.Program | Checker.Checker
> {
  const program = yield* Program.Program;
  const checker = yield* Checker.Checker;
  const handle = pipe(
    symbol.declarations,
    Array.findFirst((declaration) =>
      meanings[reading].includes(declaration.kind),
    ),
    Option.orElse(() => Array.head(symbol.declarations)),
  );
  if (Option.isNone(handle)) {
    return Option.none();
  }

  const resolved = yield* program.resolve(handle.value);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  const declaration = resolved.value;
  const library = libraryPageOf(
    symbol.name,
    declaration.getSourceFile().fileName,
  );
  if (Option.isSome(library)) {
    return library;
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
