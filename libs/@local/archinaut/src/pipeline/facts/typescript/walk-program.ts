/**
 * Program analysis: every identifier in a file asked of the checker, in one
 * batch per file. A symbol is named by its defining file and name, after
 * aliases are followed to the original declaration; a symbol declared in
 * several files, such as a property of a union, is named by the first, as
 * the checker orders them. An identifier defines a symbol when it names a
 * declaration in the symbol's own file: an import binding resolves
 * elsewhere, and so does an object literal's property typed by another
 * file's interface, so both stay references.
 */

import {
  SyntaxKind,
  getNameOfDeclaration,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  type Declaration,
  type Expression,
  type Node,
} from "typescript-7/ast";
import { SymbolFlags, type Symbol as ApiSymbol } from "typescript-7/sync";

import {
  isRepositorySource,
  moduleSymbol,
  occurrenceRecorder,
} from "./facts-shape";

import type { IndexedDocument } from "../../facts";
import type { ProgramHost } from "./program-host";

/** Whether `node` is the name of the declaration it belongs to. */
const namesDeclaration = (node: Node): boolean =>
  getNameOfDeclaration(node.parent as Declaration) === node;

export interface ProgramWalker {
  walk: (file: string) => IndexedDocument;
  /** Forgets symbol ids, which a program update invalidates. */
  reset: () => void;
}

export const createProgramWalker = (host: ProgramHost): ProgramWalker => {
  type Target = { file: string; name: string } | null;
  /** Symbol id → where it is declared, null when outside the repository. */
  let declaringFiles = new Map<number, Target>();
  /** Alias symbol id → what it resolves to. */
  let aliases = new Map<number, Target>();

  const declaration = (symbol: ApiSymbol): Target => {
    const known = declaringFiles.get(symbol.id);
    if (known !== undefined) {
      return known;
    }
    const first = symbol.declarations[0];
    const file = first === undefined ? null : host.repoRelative(first.path);
    // A module's own symbol is the file; naming it by the module id keeps a
    // namespace import and a bare import pointing at the same thing.
    const name = first?.kind === SyntaxKind.SourceFile ? "" : symbol.name;
    const target =
      file !== null && isRepositorySource(file) ? { file, name } : null;
    declaringFiles.set(symbol.id, target);
    return target;
  };

  const resolved = (symbol: ApiSymbol): Target => {
    if ((symbol.flags & SymbolFlags.Alias) === 0) {
      return declaration(symbol);
    }
    const known = aliases.get(symbol.id);
    if (known !== undefined) {
      return known;
    }
    const target = declaration(host.checker().getAliasedSymbol(symbol));
    aliases.set(symbol.id, target);
    return target;
  };

  return {
    walk: (file) => {
      const record = occurrenceRecorder();
      record(moduleSymbol(file), true);
      const sourceFile = host.sourceFile(file);
      if (sourceFile === undefined) {
        return { file, occurrences: record.occurrences };
      }
      const identifiers: Node[] = [];
      const declared: boolean[] = [];
      const moduleSpecifiers: Expression[] = [];
      const visit = (node: Node): void => {
        if (isImportDeclaration(node) && node.importClause === undefined) {
          moduleSpecifiers.push(node.moduleSpecifier);
        } else if (
          isCallExpression(node) &&
          node.expression.kind === SyntaxKind.ImportKeyword &&
          node.arguments[0] !== undefined
        ) {
          moduleSpecifiers.push(node.arguments[0]);
        } else if (isIdentifier(node)) {
          identifiers.push(node);
          declared.push(namesDeclaration(node));
        }
        node.forEachChild(visit);
      };
      visit(sourceFile);

      const checker = host.checker();
      const symbols =
        identifiers.length === 0
          ? []
          : checker.getSymbolAtLocation(identifiers);
      symbols.forEach((symbol, index) => {
        if (symbol === undefined) {
          return;
        }
        const target = resolved(symbol);
        if (target !== null) {
          record(
            `${target.file}#${target.name}`,
            (declared[index] ?? false) && target.file === file,
          );
        }
      });
      const modules =
        moduleSpecifiers.length === 0
          ? []
          : checker.getSymbolAtLocation(moduleSpecifiers);
      for (const symbol of modules) {
        const target = symbol === undefined ? null : declaration(symbol);
        if (target !== null) {
          record(moduleSymbol(target.file), false);
        }
      }
      return { file, occurrences: record.occurrences };
    },
    reset: () => {
      declaringFiles = new Map();
      aliases = new Map();
    },
  };
};
