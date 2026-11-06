import { Array, Function, Option, Order, Predicate, pipe } from "effect";
import * as Syntax from "typescript/ast";
import * as Factory from "typescript/ast/factory";
import { getNameOfDeclaration } from "typescript/ast/utils";
import { visitEachChild, visitNodesArray } from "typescript/ast/visitor";

import * as Node from "../TypeScript/Node.js";

import type * as Catalogue from "../Catalogue.js";
import type * as Parts from "./parts.js";

// The formatter needs a valid type name, and one as wide as the ellipsis breaks lines where the ellipsis would. Only this identifier object prints as an ellipsis.
const ellipsis = Factory.createIdentifier("_");
const elision = Factory.createTypeReferenceNode(ellipsis);

export const isElision = (node: Syntax.Node): boolean => node === ellipsis;

/** The type arguments `node` writes, as one list. */
const typeArgumentsOf = (node: Syntax.Node): readonly Syntax.TypeNode[] => {
  if (
    Syntax.isTypeReferenceNode(node) ||
    Syntax.isTypeQueryNode(node) ||
    Syntax.isImportTypeNode(node) ||
    Syntax.isExpressionWithTypeArguments(node)
  ) {
    return node.typeArguments ?? [];
  }

  return [];
};

/** How deep the most nested list of type arguments in `nodes` sits, where the outermost lists are at 0, or none when `nodes` write no type arguments. */
export const deepest = (
  nodes: readonly Syntax.Node[],
): Option.Option<number> => {
  const levels: number[] = [];
  const pending = Array.map(nodes, (node): readonly [Syntax.Node, number] => [
    node,
    0,
  ]);

  while (pending.length > 0) {
    const current = pending.pop();
    if (current !== undefined) {
      const [node, level] = current;
      const typeArguments = typeArgumentsOf(node);
      if (typeArguments.length > 0) {
        levels.push(level);
      }

      for (const child of node.childrenIter()) {
        const argument = typeArguments.some((candidate) => candidate === child);
        pending.push([child, level + Number(argument)]);
      }
    }
  }

  return pipe(
    levels,
    Option.liftPredicate(Array.isArrayNonEmpty),
    Option.map(Array.max(Order.Number)),
  );
};

/** `nodes` with each list of type arguments at `depth` shown as `…`, where the outermost lists are at 0. A list it leaves alone keeps its nodes, so each of its names still finds its reference. */
export const elide: {
  (depth: number): (nodes: readonly Syntax.Node[]) => readonly Syntax.Node[];
  (nodes: readonly Syntax.Node[], depth: number): readonly Syntax.Node[];
} = Function.dual(
  2,
  (nodes: readonly Syntax.Node[], depth: number): readonly Syntax.Node[] => {
    const visit = (node: Syntax.Node, current: number): Syntax.Node => {
      const typeArguments = typeArgumentsOf(node);

      let replaced = false;
      return visitEachChild(node, (child) => {
        const argument = typeArguments.some((candidate) => candidate === child);
        if (argument && current === depth) {
          if (replaced) {
            return;
          }

          replaced = true;
          return elision;
        }

        return visit(child, current + Number(argument));
      });
    };

    return visitNodesArray(nodes, (node) => visit(node, 0));
  },
);

/** Compares syntax and resolved identifier meanings without printing either tree. */
export const equivalence =
  (
    names: (self: Syntax.Identifier, that: Syntax.Identifier) => boolean,
  ): ((
    self: readonly Syntax.Node[],
    that: readonly Syntax.Node[],
  ) => boolean) =>
  (self, that) => {
    if (self.length !== that.length) {
      return false;
    }

    const pending = Array.zip(self, that);
    while (pending.length > 0) {
      const pair = pending.pop();
      if (pair === undefined) {
        break;
      }

      const [left, right] = pair;
      if (left.kind !== right.kind) {
        return false;
      }

      for (const key of [
        "text",
        "operator",
        "token",
        "isTypeOf",
        "isTypeOnly",
        "tokenFlags",
        "postfix",
      ] as const) {
        const leftValue = Predicate.hasProperty(left, key)
          ? left[key]
          : undefined;
        const rightValue = Predicate.hasProperty(right, key)
          ? right[key]
          : undefined;
        if (leftValue !== rightValue) {
          return false;
        }
      }

      if (
        Syntax.isIdentifier(left) &&
        Syntax.isIdentifier(right) &&
        !names(left, right)
      ) {
        return false;
      }

      const leftChildren = Array.fromIterable(left.childrenIter());
      const rightChildren = Array.fromIterable(right.childrenIter());
      if (leftChildren.length !== rightChildren.length) {
        return false;
      }

      pending.push(...Array.zip(leftChildren, rightChildren));
    }

    return true;
  };

const modifiers = (
  source: readonly Syntax.ModifierLike[] | undefined,
  exported: boolean,
): readonly Syntax.ModifierLike[] => {
  const kept = Array.filter(
    source ?? [],
    (modifier) =>
      modifier.kind !== Syntax.SyntaxKind.DeclareKeyword &&
      (modifier.kind !== Syntax.SyntaxKind.ExportKeyword || exported) &&
      (modifier.kind !== Syntax.SyntaxKind.DefaultKeyword || exported),
  );

  if (
    exported &&
    !Array.some(
      kept,
      (modifier) => modifier.kind === Syntax.SyntaxKind.ExportKeyword,
    )
  ) {
    return Array.prepend(
      kept,
      Factory.createToken(Syntax.SyntaxKind.ExportKeyword),
    );
  }

  if (source !== undefined && kept.length === source.length) {
    return source;
  }

  return kept;
};

interface Options {
  readonly exported: Option.Option<Catalogue.Entry>;
}

/** A public name as an export specifier spells it: an identifier where it is one, and otherwise a string. */
const exportName = (name: string): Syntax.ModuleExportName => {
  if (Syntax.isIdentifierText(name)) {
    return Factory.createIdentifier(name);
  }

  return Factory.createStringLiteral(name, Syntax.TokenFlags.None);
};

/** Whether `name` can name a declaration in a module, whose strict code reserves words such as `let` besides the ones every script reserves. */
const isDeclarable = (name: string): boolean => {
  const scanner = Syntax.createScanner(true, undefined, name);
  const token = scanner.scan();

  return (
    Syntax.isIdentifierText(name) &&
    scanner.scan() === Syntax.SyntaxKind.EndOfFile &&
    (token < Syntax.SyntaxKind.FirstReservedWord ||
      token > Syntax.SyntaxKind.LastFutureReservedWord)
  );
};

/** Whether a reader could call, construct or read the declaration at runtime, which a type-only export takes away. */
const declaresValue = (source: Parts.Source["node"]): boolean =>
  Syntax.isClassDeclaration(source) ||
  Syntax.isFunctionDeclaration(source) ||
  Syntax.isEnumDeclaration(source) ||
  Syntax.isVariableDeclaration(source);

/** How a declaration reads under its public name. */
interface Spelling {
  /** The declaration carries `export` itself. */
  readonly exported: boolean;
  /** The public name, where the declaration takes it in place of its own. */
  readonly name: Option.Option<Syntax.Identifier>;
  /** The statement that exports the declaration, where the declaration cannot: a public name no declaration can carry, or a value exported type-only. */
  readonly statement: Option.Option<Syntax.ExportDeclaration>;
}

const spellingOf = (
  source: Parts.Source["node"],
  exported: Option.Option<Catalogue.Entry>,
): Spelling => {
  const declared: Spelling = {
    exported: true,
    name: Option.none(),
    statement: Option.none(),
  };
  const named = pipe(
    source,
    getNameOfDeclaration,
    Option.fromUndefinedOr,
    Option.filter(Syntax.isIdentifier),
  );

  return Option.match(exported, {
    onNone: () => ({ ...declared, exported: false }),
    onSome: (entry) =>
      pipe(
        Option.all([Array.last(entry.name.path), named]),
        Option.match({
          onNone: () => declared,
          onSome: ([name, original]): Spelling => {
            const typeOnly = entry.nameTypeOnlyExport && declaresValue(source);
            if (!typeOnly && name === original.text) {
              return declared;
            }
            if (!typeOnly && isDeclarable(name)) {
              return {
                ...declared,
                name: Option.some(Factory.createIdentifier(name)),
              };
            }

            // The specifier names the declaration again only where the public name differs from it.
            let specifier = Factory.createExportSpecifier(
              false,
              undefined,
              exportName(name),
            );
            if (name !== original.text) {
              specifier = Factory.createExportSpecifier(
                false,
                Factory.createIdentifier(original.text),
                exportName(name),
              );
            }

            return {
              exported: false,
              name: Option.none(),
              statement: Option.some(
                Factory.createExportDeclaration(
                  undefined,
                  entry.nameTypeOnlyExport,
                  Factory.createNamedExports([specifier]),
                ),
              ),
            };
          },
        }),
      ),
  });
};

/** Projects declarations by updating selected fields and retaining identifier objects. A declaration carries `export` and its public name where it can, and otherwise an export statement comes first. */
export const project: {
  (
    options: Options,
  ): (part: {
    readonly source: Parts.Source;
  }) => Array.NonEmptyReadonlyArray<Syntax.Node>;
  (
    part: { readonly source: Parts.Source },
    options: Options,
  ): Array.NonEmptyReadonlyArray<Syntax.Node>;
} = Function.dual(
  2,
  (
    part: { readonly source: Parts.Source },
    options: Options,
  ): Array.NonEmptyReadonlyArray<Syntax.Node> => {
    const source = part.source.node;
    const spelling = spellingOf(source, options.exported);
    const { exported } = spelling;
    const typeOnlyExport = options.exported.pipe(
      Option.exists((entry) => entry.typeOnlyExport),
    );

    let node: Syntax.Node = source;
    if (Syntax.isClassDeclaration(source)) {
      let members: readonly Syntax.ClassElement[] = source.members;
      if (typeOnlyExport) {
        members = Array.filter(
          source.members,
          (member) =>
            !Syntax.isConstructorDeclaration(member) &&
            !Node.hasModifier(member, Syntax.ModifierFlags.Static),
        );
      }

      node = Factory.updateClassDeclaration(
        source,
        modifiers(source.modifiers, exported),
        Option.getOrElse(spelling.name, () => source.name),
        source.typeParameters,
        source.heritageClauses,
        members,
      );
    } else if (Syntax.isInterfaceDeclaration(source)) {
      node = Factory.updateInterfaceDeclaration(
        source,
        modifiers(source.modifiers, exported),
        Option.getOrElse(spelling.name, () => source.name),
        source.typeParameters,
        source.heritageClauses,
        source.members,
      );
    } else if (Syntax.isTypeAliasDeclaration(source)) {
      node = Factory.updateTypeAliasDeclaration(
        source,
        modifiers(source.modifiers, exported),
        Option.getOrElse(spelling.name, () => source.name),
        source.typeParameters,
        source.type,
      );
    } else if (Syntax.isFunctionDeclaration(source)) {
      node = Factory.updateFunctionDeclaration(
        source,
        modifiers(source.modifiers, exported),
        source.asteriskToken,
        Option.getOrElse(spelling.name, () => source.name),
        source.typeParameters,
        source.parameters,
        source.type,
      );
    } else if (Syntax.isEnumDeclaration(source)) {
      node = Factory.updateEnumDeclaration(
        source,
        modifiers(source.modifiers, exported),
        Option.getOrElse(spelling.name, () => source.name),
        source.members,
      );
    } else if (
      Syntax.isVariableDeclaration(source) &&
      Syntax.isVariableDeclarationList(source.parent) &&
      Syntax.isVariableStatement(source.parent.parent)
    ) {
      const declarations = source.parent.declarations;
      const selected = Option.match(spelling.name, {
        onNone: () => (declarations.length === 1 ? declarations : [source]),
        onSome: (name) => [
          Factory.updateVariableDeclaration(
            source,
            name,
            source.exclamationToken,
            source.type,
            source.initializer,
          ),
        ],
      });
      const list = Factory.updateVariableDeclarationList(
        source.parent,
        selected,
      );
      node = Factory.updateVariableStatement(
        source.parent.parent,
        modifiers(source.parent.parent.modifiers, exported),
        list,
      );
    }

    return Array.prepend(Option.toArray(spelling.statement), node);
  },
);

/** Supplies the grammar context needed to parse a printed member or type on its own. */
export const context = (
  node: Syntax.Node,
): { readonly prefix: string; readonly suffix: string } => {
  if (Syntax.isTypePredicateNode(node)) {
    return { prefix: "declare function __Printed(): ", suffix: ";" };
  }
  if (Syntax.isTypeNode(node) || Syntax.isExpressionWithTypeArguments(node)) {
    return { prefix: "type __Printed = ", suffix: ";" };
  }
  if (Syntax.isEnumMember(node)) {
    return { prefix: "enum __Printed {\n", suffix: "\n}" };
  }
  if (
    Syntax.isPropertyDeclaration(node) ||
    Syntax.isPropertySignatureDeclaration(node) ||
    Syntax.isMethodDeclaration(node) ||
    Syntax.isMethodSignatureDeclaration(node) ||
    Syntax.isGetAccessorDeclaration(node) ||
    Syntax.isSetAccessorDeclaration(node) ||
    Syntax.isConstructorDeclaration(node) ||
    Syntax.isIndexSignatureDeclaration(node)
  ) {
    return { prefix: "declare class __Printed {\n", suffix: "\n}" };
  }
  if (
    Syntax.isCallSignatureDeclaration(node) ||
    Syntax.isConstructSignatureDeclaration(node)
  ) {
    return { prefix: "interface __Printed {\n", suffix: "\n}" };
  }
  return { prefix: "", suffix: "" };
};
