import { Array } from "effect";
import { SyntaxKind, isJSDoc } from "typescript/ast";
import { getSynthesizedDeepClone } from "typescript/ast/clone";
import * as factory from "typescript/ast/factory";
import { visitEachChild } from "typescript/ast/visitor";

import type { ClassDeclaration, Node } from "typescript/ast";
import type { Visitor } from "typescript/ast/visitor";

const removeDocumentation: Visitor = (node) => {
  if (isJSDoc(node)) {
    return;
  }

  return visitEachChild(node, removeDocumentation);
};

/** Exercises syntax transformation without changing the compiler's original nodes. */
export const cloneWithoutComments = <T extends Node>(node: T): T =>
  visitEachChild(getSynthesizedDeepClone(node), removeDocumentation);

/** The fixture projection omits the class's value-side declarations and changes its display name. */
export const instanceClass = (node: ClassDeclaration): ClassDeclaration => {
  const copy = cloneWithoutComments(node);
  const members = Array.filter(copy.members, (member) => {
    if (member.kind === SyntaxKind.Constructor) {
      return false;
    }
    for (const child of member.childrenIter()) {
      if (child.kind === SyntaxKind.StaticKeyword) {
        return false;
      }
    }

    return true;
  });
  return factory.createClassDeclaration(
    [factory.createToken(SyntaxKind.ExportKeyword)],
    factory.createIdentifier("TypeBox"),
    copy.typeParameters,
    copy.heritageClauses,
    members,
  );
};
