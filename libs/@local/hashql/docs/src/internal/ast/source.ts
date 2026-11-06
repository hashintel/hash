import { Array, Function, Option } from "effect";
import {
  SyntaxKind,
  isClassDeclaration,
  isComputedPropertyName,
  isEnumDeclaration,
  isFunctionDeclaration,
  isInterfaceDeclaration,
  isJSDoc,
  isModuleDeclaration,
  isSourceFile,
  isTypeAliasDeclaration,
  isVariableDeclaration,
} from "typescript/ast";

import type {
  ClassDeclaration,
  EnumDeclaration,
  FunctionDeclaration,
  HeritageClause,
  InterfaceDeclaration,
  JSDoc,
  ModuleDeclaration,
  Node,
  PropertyName,
  TypeAliasDeclaration,
  VariableDeclaration,
} from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

// TSDoc reads a tag's name regardless of case, so `@Module` marks a module comment too.
const isModuleComment = (comment: JSDoc): boolean =>
  Array.some(
    comment.tags ?? [],
    ({ tagName }) => tagName.text.toLowerCase() === "module",
  );

/** The node whose comments document `node`. A variable's comments are on its statement. */
const hostOf = (node: Node): Node | undefined => {
  if (!isVariableDeclaration(node)) {
    return node;
  }

  // SAFETY: Compiler factories leave parent unset despite declaring it as Node.
  const parent = node.parent as Node | undefined;
  return parent?.parent;
};

/** Selects a file's leading module comment or a declaration's last non-module comment. */
export const commentOf = (node: Node): Option.Option<JSDoc> => {
  if (isSourceFile(node)) {
    const [first] = node.statements;

    return Array.findFirst(
      first?.jsDoc ?? [],
      (comment): comment is JSDoc =>
        isJSDoc(comment) && isModuleComment(comment),
    );
  }

  return Array.findLast(
    hostOf(node)?.jsDoc ?? [],
    (comment): comment is JSDoc =>
      isJSDoc(comment) && !isModuleComment(comment),
  );
};

/** The module comments on `node` that its file does not select as its own, so neither the file nor `node` shows them. */
export const strayModuleComments = (node: Node): readonly JSDoc[] => {
  const modules = Array.filter(
    hostOf(node)?.jsDoc ?? [],
    (comment): comment is JSDoc => isJSDoc(comment) && isModuleComment(comment),
  );

  if (modules.length === 0) {
    return modules;
  }

  const selected = commentOf(node.getSourceFile());
  return Array.filter(
    modules,
    (comment) => !Option.exists(selected, (own) => own === comment),
  );
};

/** A member's name as its declaration spells it, without the quotes of a string-literal name. A computed name reads as written. */
export const nameOf = (name: PropertyName): string => {
  if (isComputedPropertyName(name)) {
    return name.getText();
  }

  return name.text;
};

type HeritageToken = SyntaxKind.ExtendsKeyword | SyntaxKind.ImplementsKeyword;

/** The type expressions of a class's heritage clauses that `token` introduces, in source order. */
export const heritageOf: {
  (
    token: HeritageToken,
  ): (node: ClassDeclaration) => readonly HeritageClause["types"][number][];
  (
    node: ClassDeclaration,
    token: HeritageToken,
  ): readonly HeritageClause["types"][number][];
} = Function.dual(2, (node: ClassDeclaration, token: HeritageToken) =>
  Array.flatMap(node.heritageClauses ?? [], (clause) =>
    clause.token === token ? clause.types : [],
  ),
);

export type Definition =
  | ClassDeclaration
  | InterfaceDeclaration
  | TypeAliasDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | EnumDeclaration
  | ModuleDeclaration;

/** Whether `node` declares a name of its module or namespace, as a statement does. */
export const isDefinition = (node: Node): node is Definition =>
  isClassDeclaration(node) ||
  isInterfaceDeclaration(node) ||
  isTypeAliasDeclaration(node) ||
  isFunctionDeclaration(node) ||
  isVariableDeclaration(node) ||
  isEnumDeclaration(node) ||
  isModuleDeclaration(node);

/** Describes source syntax without following its parents or children. */
export const inspectNode = (
  node: Node,
): { readonly kind: string; readonly pos: number; readonly end: number } => ({
  kind: SyntaxKind[node.kind],
  pos: node.pos,
  end: node.end,
});

/** Describes a compiler symbol without traversing its declarations. */
export const inspectSymbol = (
  symbol: CompilerSymbol,
): Pick<CompilerSymbol, "name" | "flags"> => ({
  name: symbol.name,
  flags: symbol.flags,
});
