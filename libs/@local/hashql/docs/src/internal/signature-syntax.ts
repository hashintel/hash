import { Array, Function, Option, Predicate, pipe } from "effect";
import * as Syntax from "typescript/ast";
import * as Factory from "typescript/ast/factory";
import { getNameOfDeclaration } from "typescript/ast/utils";

import * as Node from "../TypeScript/Node.js";

import type * as Catalogue from "../Catalogue.js";
import type * as Parts from "./parts.js";

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
  /** The statement that exports the declaration, where the declaration cannot: a public name other than its own, or a value exported type-only. */
  readonly statement: Option.Option<Syntax.ExportDeclaration>;
}

const spellingOf = (
  source: Parts.Source["node"],
  exported: Option.Option<Catalogue.Entry>,
): Spelling => {
  const declared: Spelling = {
    exported: true,
    defaultExport: true,
    statement: Option.none(),
  };
  const named = pipe(
    source,
    getNameOfDeclaration,
    Option.fromUndefinedOr,
    Option.filter(Syntax.isIdentifier),
  );

  return Option.match(exported, {
    onNone: () => ({ ...declared, exported: false, defaultExport: false }),
    onSome: (entry) =>
      pipe(
        Option.all([Array.last(entry.name.path), named]),
        Option.match({
          onNone: () => declared,
          onSome: ([name, original]): Spelling => {
            const typeOnly = entry.nameTypeOnlyExport && declaresValue(source);
            if (!typeOnly && name === original.text) {
              return { ...declared, defaultExport: false };
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
              defaultExport: false,
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

/** Projects declarations by updating selected fields and retaining identifier objects. A declaration keeps its own name and carries `export` where its public name is that name, and otherwise an export statement follows it. */
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
