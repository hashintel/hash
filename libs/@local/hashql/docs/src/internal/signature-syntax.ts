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
  { exported, defaultExport }: Pick<Spelling, "exported" | "defaultExport">,
): readonly Syntax.ModifierLike[] => {
  const kept = Array.filter(
    source ?? [],
    (modifier) =>
      modifier.kind !== Syntax.SyntaxKind.DeclareKeyword &&
      (modifier.kind !== Syntax.SyntaxKind.ExportKeyword || exported) &&
      (modifier.kind !== Syntax.SyntaxKind.DefaultKeyword || defaultExport),
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

/** A public declaration: its catalogue entry, and every name the namespace holding its canonical name exports it under. */
export interface Exported {
  readonly entry: Catalogue.Entry;
  readonly names: readonly Catalogue.ExportName[];
}

interface Options {
  readonly exported: Option.Option<Exported>;
}

/** A public name as an export specifier spells it: an identifier where it is one, and otherwise a string. */
const exportName = (name: string): Syntax.ModuleExportName => {
  if (Syntax.isIdentifierText(name)) {
    return Factory.createIdentifier(name);
  }

  return Factory.createStringLiteral(name, Syntax.TokenFlags.None);
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
  /** The declaration keeps `default`, because it is the module's default export under no name of its own. */
  readonly defaultExport: boolean;
  /** The statement that exports the declaration under the names it cannot carry: every public name other than its own, and its own where a value's export is type-only. */
  readonly statement: Option.Option<Syntax.ExportDeclaration>;
}

/** The statement that exports `own` under `names`. A restriction every name shares goes on the statement, and otherwise on each name that has it. */
const statementOf = (
  own: Syntax.Identifier,
  names: Array.NonEmptyReadonlyArray<Catalogue.ExportName>,
): Syntax.ExportDeclaration => {
  const typeOnly = Array.every(names, ({ typeOnlyExport }) => typeOnlyExport);

  return Factory.createExportDeclaration(
    undefined,
    typeOnly,
    Factory.createNamedExports(
      Array.map(names, ({ name, typeOnlyExport }) => {
        const isTypeOnly = !typeOnly && typeOnlyExport;

        // The specifier names the declaration again only where the public name differs from it.
        if (name === own.text) {
          return Factory.createExportSpecifier(
            isTypeOnly,
            undefined,
            exportName(name),
          );
        }

        return Factory.createExportSpecifier(
          isTypeOnly,
          Factory.createIdentifier(own.text),
          exportName(name),
        );
      }),
    ),
  );
};

const spellingOf = (
  source: Parts.Source["node"],
  names: readonly Catalogue.ExportName[],
): Spelling =>
  pipe(
    source,
    getNameOfDeclaration,
    Option.fromUndefinedOr,
    Option.filter(Syntax.isIdentifier),
    Option.match({
      onNone: (): Spelling => {
        const exported = Array.isReadonlyArrayNonEmpty(names);

        return { exported, defaultExport: exported, statement: Option.none() };
      },
      onSome: (own): Spelling => {
        const value = declaresValue(source);
        const exported = Array.some(
          names,
          ({ name, typeOnlyExport }) =>
            name === own.text && !(typeOnlyExport && value),
        );

        return {
          exported,
          defaultExport: false,
          statement: pipe(
            names,
            Array.filter(({ name }) => !exported || name !== own.text),
            Option.liftPredicate(
              Array.isReadonlyArrayNonEmpty<Catalogue.ExportName>,
            ),
            Option.map((others) => statementOf(own, others)),
          ),
        };
      },
    }),
  );

/** Projects declarations by updating selected fields and retaining identifier objects. A declaration keeps its own name and carries `export` where one of its public names is that name, and its other public names follow in one export statement. */
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
    const spelling = spellingOf(
      source,
      Option.match(options.exported, {
        onNone: () => [],
        onSome: ({ names }) => names,
      }),
    );
    const typeOnlyExport = options.exported.pipe(
      Option.exists(({ entry }) => entry.typeOnlyExport),
    );

    let node: Syntax.Node = source;
    if (Syntax.isClassDeclaration(source)) {
      // A private constructor stays, because it tells a reader that code outside the class cannot construct it.
      const open = Array.filter(
        source.members,
        (member) =>
          Syntax.isConstructorDeclaration(member) || !Node.isPrivate(member),
      );
      let members: readonly Syntax.ClassElement[] =
        open.length === source.members.length ? source.members : open;
      if (typeOnlyExport) {
        members = Array.filter(
          members,
          (member) =>
            !Syntax.isConstructorDeclaration(member) &&
            !Node.hasModifier(member, Syntax.ModifierFlags.Static),
        );
      }

      node = Factory.updateClassDeclaration(
        source,
        modifiers(source.modifiers, spelling),
        source.name,
        source.typeParameters,
        source.heritageClauses,
        members,
      );
    } else if (Syntax.isInterfaceDeclaration(source)) {
      node = Factory.updateInterfaceDeclaration(
        source,
        modifiers(source.modifiers, spelling),
        source.name,
        source.typeParameters,
        source.heritageClauses,
        source.members,
      );
    } else if (Syntax.isTypeAliasDeclaration(source)) {
      node = Factory.updateTypeAliasDeclaration(
        source,
        modifiers(source.modifiers, spelling),
        source.name,
        source.typeParameters,
        source.type,
      );
    } else if (Syntax.isFunctionDeclaration(source)) {
      node = Factory.updateFunctionDeclaration(
        source,
        modifiers(source.modifiers, spelling),
        source.asteriskToken,
        source.name,
        source.typeParameters,
        source.parameters,
        source.type,
      );
    } else if (Syntax.isEnumDeclaration(source)) {
      node = Factory.updateEnumDeclaration(
        source,
        modifiers(source.modifiers, spelling),
        source.name,
        source.members,
      );
    } else if (
      Syntax.isVariableDeclaration(source) &&
      Syntax.isVariableDeclarationList(source.parent) &&
      Syntax.isVariableStatement(source.parent.parent)
    ) {
      const declarations = source.parent.declarations;
      const selected = declarations.length === 1 ? declarations : [source];
      const list = Factory.updateVariableDeclarationList(
        source.parent,
        selected,
      );
      node = Factory.updateVariableStatement(
        source.parent.parent,
        modifiers(source.parent.parent.modifiers, spelling),
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
