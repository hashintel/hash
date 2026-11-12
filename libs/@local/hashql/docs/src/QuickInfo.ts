import { Data, Effect, Function, Option, String } from "effect";
import {
  NodeFlags,
  isParameterDeclaration,
  isSourceFile,
  isVariableDeclarationList,
} from "typescript/ast";
import { NodeBuilderFlags, SignatureKind, SymbolFlags } from "typescript/async";

import * as Api from "./TypeScript/Api.js";
import * as Checker from "./TypeScript/Checker.js";
import * as Node from "./TypeScript/Node.js";
import * as Program from "./TypeScript/Program.js";
import * as Symbol from "./TypeScript/Symbol.js";

import type { Cause } from "effect";
import type {
  CallSignatureDeclaration,
  Identifier,
  Node as SyntaxNode,
  TypeNode,
} from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

/**
 * What an editor shows on hover over a name in code, as the syntax the compiler builds for it.
 *
 * The name itself is the identifier the quick info belongs to. A display adds the keyword, the name and the printed syntax together.
 */
export type QuickInfo = Data.TaggedEnum<{
  /** A variable, a property or an accessor, with the type it has where the name mentions it. */
  Value: {
    readonly keyword:
      | "const"
      | "let"
      | "var"
      | "(parameter)"
      | "(property)"
      | "(accessor)";
    readonly type: TypeNode;
  };
  /** A function or a method, with its first call signature and how many others it has. */
  Callable: {
    readonly keyword: "function" | "(method)";
    readonly signature: Option.Option<CallSignatureDeclaration>;
    readonly others: number;
  };
  /** A type alias, with the type it names. */
  Alias: { readonly type: TypeNode };
  /** An interface or a class, with its type parameters. */
  Declared: {
    readonly keyword: "interface" | "class";
    readonly type: TypeNode;
  };
  /** A namespace, which quick info shows by its keyword and its name alone. */
  Named: { readonly keyword: "namespace" };
}>;

export const {
  Value,
  Callable,
  Alias,
  Declared,
  Named,
  $match: match,
} = Data.taggedEnum<QuickInfo>();

/** Quick info writes every type with these flags, so an alias the code does not declare keeps its name. */
const builderFlags = NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope;

/** In a type alias the compiler writes the type the alias names, rather than the alias. */
const aliasFlags =
  // oxlint-disable-next-line no-bitwise -- `NodeBuilderFlags` is the compiler's bit set.
  NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
  NodeBuilderFlags.InTypeAlias;

/** The keyword quick info shows before a variable declared at or above `node`: `(parameter)`, or the keyword of the declaration list that declares it. */
const bindingOf = (
  node: SyntaxNode,
): Extract<QuickInfo, { readonly _tag: "Value" }>["keyword"] => {
  if (isParameterDeclaration(node)) {
    return "(parameter)";
  }

  if (isVariableDeclarationList(node)) {
    if (Node.hasFlag(node, NodeFlags.Const)) {
      return "const";
    }

    return Node.hasFlag(node, NodeFlags.Let) ? "let" : "var";
  }

  // A binding element inside the declaration list declares a destructured name.
  if (isSourceFile(node.parent)) {
    return "var";
  }

  return bindingOf(node.parent);
};

/** The keyword quick info shows before a variable, a property or an accessor. A variable whose declaration the program does not hold is a `var`, as the standard library declares its globals. */
const keywordOf = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  if (Symbol.hasFlag(symbol, SymbolFlags.Property)) {
    return "(property)" as const;
  }

  if (Symbol.hasFlag(symbol, SymbolFlags.Accessor)) {
    return "(accessor)" as const;
  }

  if (symbol.valueDeclaration === undefined) {
    return "var" as const;
  }

  const program = yield* Program.Program;
  const declaration = yield* program.resolve(symbol.valueDeclaration);

  return Option.match(declaration, {
    onNone: () => "var" as const,
    onSome: bindingOf,
  });
});

const describe = Effect.fnUntraced(function* (
  name: Identifier,
  symbol: CompilerSymbol,
) {
  const checker = yield* Checker.Checker;

  // A variable comes first, because a module's default export can be a namespace as well.
  if (
    Symbol.hasFlag(symbol, SymbolFlags.Variable) ||
    Symbol.hasFlag(symbol, SymbolFlags.PropertyOrAccessor)
  ) {
    const keyword = yield* keywordOf(symbol);
    const type = yield* checker.getTypeOfSymbolAtLocation(symbol, name);
    const node = yield* checker.typeToTypeNode(type, name, builderFlags);

    return Option.map(node, (value) => Value({ keyword, type: value }));
  }

  if (
    Symbol.hasFlag(symbol, SymbolFlags.Function) ||
    Symbol.hasFlag(symbol, SymbolFlags.Method)
  ) {
    const type = yield* checker.getTypeOfSymbolAtLocation(symbol, name);
    const signatures = yield* checker.getSignaturesOfType(
      type,
      SignatureKind.Call,
    );
    const [first] = signatures;
    let signature = Option.none<CallSignatureDeclaration>();
    if (first !== undefined) {
      signature = yield* checker.signatureToDeclaration(first, name);
    }

    return Option.some(
      Callable({
        keyword: Symbol.hasFlag(symbol, SymbolFlags.Method)
          ? "(method)"
          : "function",
        signature,
        others: Math.max(signatures.length - 1, 0),
      }),
    );
  }

  if (Symbol.hasFlag(symbol, SymbolFlags.TypeAlias)) {
    const type = yield* checker.getDeclaredTypeOfSymbol(symbol);
    const node = yield* checker.typeToTypeNode(type, name, aliasFlags);

    return Option.map(node, (value) => Alias({ type: value }));
  }

  if (
    Symbol.hasFlag(symbol, SymbolFlags.Interface) ||
    Symbol.hasFlag(symbol, SymbolFlags.Class)
  ) {
    const type = yield* checker.getDeclaredTypeOfSymbol(symbol);
    const node = yield* checker.typeToTypeNode(type, name, builderFlags);

    return Option.map(node, (value) =>
      Declared({
        keyword: Symbol.hasFlag(symbol, SymbolFlags.Interface)
          ? "interface"
          : "class",
        type: value,
      }),
    );
  }

  if (Symbol.hasFlag(symbol, SymbolFlags.Module)) {
    return Option.some(Named({ keyword: "namespace" }));
  }

  return Option.none<QuickInfo>();
});

/**
 * The quick info of `name`, which the compiler resolves to `resolved`, or none for a symbol quick info does not show, such as an enum member.
 *
 * An imported name shows what it imports. A function shows its first call signature, as an editor does.
 */
export const of: {
  (
    resolved: CompilerSymbol,
  ): (
    name: Identifier,
  ) => Effect.Effect<
    Option.Option<QuickInfo>,
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
  (
    name: Identifier,
    resolved: CompilerSymbol,
  ): Effect.Effect<
    Option.Option<QuickInfo>,
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (name: Identifier, resolved: CompilerSymbol) {
    const checker = yield* Checker.Checker;
    let symbol = resolved;
    if (Symbol.hasFlag(resolved, SymbolFlags.Alias)) {
      symbol = yield* checker.getAliasedSymbol(resolved);
    }

    const unknown = yield* checker.isUnknownSymbol(symbol);
    if (unknown) {
      return Option.none<QuickInfo>();
    }

    return yield* describe(name, symbol);
  }),
);

/** The note quick info adds after a function's first signature for the others. */
const overloadsOf = (others: number): string => {
  if (others === 0) {
    return "";
  }

  return others === 1 ? " (+1 overload)" : ` (+${others} overloads)`;
};

/** Quick info as an editor shows it over `name`, such as `const query: ExpressionType`. */
export const display: {
  (
    name: Identifier,
  ): (info: QuickInfo) => Effect.Effect<string, Cause.UnknownError, Api.Api>;
  (
    info: QuickInfo,
    name: Identifier,
  ): Effect.Effect<string, Cause.UnknownError, Api.Api>;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (info: QuickInfo, name: Identifier) {
    const api = yield* Api.Api;

    return yield* match(info, {
      Value: ({ keyword, type }) =>
        api
          .print(type)
          .pipe(Effect.map((text) => `${keyword} ${name.text}: ${text}`)),
      Callable: ({ keyword, signature, others }) =>
        Option.match(signature, {
          onNone: () => Effect.succeed(`${keyword} ${name.text}`),
          onSome: (node) =>
            api.print(node).pipe(
              // The printer ends a call signature with the `;` that separates it from the next member of a type literal.
              Effect.map((text) => String.replace(/;$/u, "")(text.trimEnd())),
              Effect.map(
                (text) =>
                  `${keyword} ${name.text}${text}${overloadsOf(others)}`,
              ),
            ),
        }),
      Alias: ({ type }) =>
        api
          .print(type)
          .pipe(Effect.map((text) => `type ${name.text} = ${text}`)),
      Declared: ({ keyword, type }) =>
        api.print(type).pipe(Effect.map((text) => `${keyword} ${text}`)),
      Named: ({ keyword }) => Effect.succeed(`${keyword} ${name.text}`),
    });
  }),
);
