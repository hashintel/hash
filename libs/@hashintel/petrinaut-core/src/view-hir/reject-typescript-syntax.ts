import ts from "@typescript/typescript6";

const TYPESCRIPT_ONLY_NOTE =
  " Visualizers are JavaScript with JSX; the editor infers the types.";

/** Modifiers only TypeScript has; a visualizer is JavaScript. */
const TYPESCRIPT_MODIFIERS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.DeclareKeyword,
  ts.SyntaxKind.AbstractKeyword,
  ts.SyntaxKind.ReadonlyKeyword,
  ts.SyntaxKind.PublicKeyword,
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.OverrideKeyword,
]);

/**
 * Fails on the first TypeScript-only construct in a visualizer: type
 * annotations and assertions, declarations, type arguments and modifiers.
 * The lowering has no node for any of them, so this is a friendlier message
 * ahead of "unsupported syntax", and it also catches the annotations the
 * expression lowering would otherwise look through.
 */
export function rejectTypeScriptSyntax(
  sourceFile: ts.SourceFile,
  fail: (node: ts.Node, code: string, message: string) => never,
): void {
  const visit = (node: ts.Node): void => {
    if (
      node.kind >= ts.SyntaxKind.FirstTypeNode &&
      node.kind <= ts.SyntaxKind.LastTypeNode
    ) {
      fail(
        node,
        "hir:typescript-syntax",
        `Type annotations are not allowed.${TYPESCRIPT_ONLY_NOTE}`,
      );
    }
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node)
    ) {
      fail(
        node,
        "hir:typescript-syntax",
        `Type assertions are not allowed.${TYPESCRIPT_ONLY_NOTE}`,
      );
    }
    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      fail(
        node,
        "hir:typescript-syntax",
        `TypeScript declarations are not allowed.${TYPESCRIPT_ONLY_NOTE}`,
      );
    }
    if (
      (ts.isFunctionLike(node) && node.typeParameters !== undefined) ||
      ((ts.isCallExpression(node) || ts.isNewExpression(node)) &&
        node.typeArguments !== undefined)
    ) {
      fail(
        node,
        "hir:typescript-syntax",
        `Type parameters are not allowed.${TYPESCRIPT_ONLY_NOTE}`,
      );
    }
    if (
      (ts.isParameter(node) && node.questionToken !== undefined) ||
      (ts.isVariableDeclaration(node) && node.exclamationToken !== undefined)
    ) {
      fail(
        node,
        "hir:typescript-syntax",
        `This marker is TypeScript syntax.${TYPESCRIPT_ONLY_NOTE}`,
      );
    }
    if (ts.canHaveModifiers(node)) {
      const modifier = (ts.getModifiers(node) ?? []).find((candidate) =>
        TYPESCRIPT_MODIFIERS.has(candidate.kind),
      );
      if (modifier) {
        fail(
          modifier,
          "hir:typescript-syntax",
          `\`${modifier.getText(sourceFile)}\` is TypeScript syntax.${TYPESCRIPT_ONLY_NOTE}`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}
