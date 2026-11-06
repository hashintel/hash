import { Option } from "effect";

import * as AST from "../AST/index.js";
import * as Syntax from "./signature-syntax.js";

import type { Node } from "typescript/ast";

const sameReference = Option.makeEquivalence<AST.Reference.Reference.Target>(
  AST.Reference.sameTarget,
);

/** Syntax is equal when it has the same spelling and each of its names resolves to the same thing, so equal spellings of different types stay apart. */
export const syntax =
  (
    ast: AST.Store["Service"],
  ): ((self: readonly Node[], that: readonly Node[]) => boolean) =>
  (self, that) =>
    Syntax.equivalence((left, right) =>
      sameReference(
        Option.map(ast.referenceAt(left), ({ target }) => target),
        Option.map(ast.referenceAt(right), ({ target }) => target),
      ),
    )(self, that);
