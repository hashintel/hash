/**
 * Syntactic analysis: imports and exports only, no checker. Each file's
 * surface is its exported names, where each comes from, and the modules it
 * imports; a reference is an imported name followed through `export ... from`
 * and `export *` chains to the file that declares it. What this cannot see
 * is a reference the checker infers, such as a property of a type another
 * file declares, used through a value whose type came from elsewhere.
 */

import {
  SyntaxKind,
  isCallExpression,
  isExportAssignment,
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isNamedExports,
  isNamedImports,
  isNamespaceExport,
  isNamespaceImport,
  isPropertyAccessExpression,
  isQualifiedName,
  isStringLiteral,
  isVariableStatement,
  type BindingName,
  type Node,
  type SourceFile,
} from "typescript-7/ast";

import {
  isRepositorySource,
  moduleSymbol,
  occurrenceRecorder,
} from "./facts-shape";

import type { IndexedDocument } from "../../facts";
import type { ProgramHost } from "./program-host";

type Origin =
  /** Declared here, under `name`, which an `export { a as b }` can differ from. */
  | { kind: "local"; name: string }
  | { kind: "reexport"; from: string; name: string };

interface Surface {
  file: string;
  /** Exported name → where it comes from. */
  exports: Map<string, Origin>;
  /** Files whose exports `export *` forwards, in order. */
  stars: string[];
  /** Imported or re-exported names, by the resolved file they come from. */
  references: { from: string; name: string }[];
  /** Files imported as a whole: bare, dynamic and namespace imports. */
  modules: string[];
}

const declarationKinds = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
]);

const hasModifier = (node: Node, kind: SyntaxKind): boolean =>
  ((node as { modifiers?: readonly Node[] }).modifiers ?? []).some(
    (modifier) => modifier.kind === kind,
  );

/** Every identifier a binding name introduces: `x`, or all of `{ a, b: [c] }`. */
const boundNames = (name: BindingName): string[] => {
  if (isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) =>
    element.name === undefined ? [] : boundNames(element.name),
  );
};

export interface SyntacticWalker {
  /** Reads a file's surface again, after it changed. */
  refresh: (file: string) => void;
  /** Documents for `files`, resolved through every surface read so far. */
  documents: (files: string[]) => IndexedDocument[];
  /** Forgets every surface, which a program update invalidates. */
  reset: () => void;
}

export const createSyntacticWalker = (host: ProgramHost): SyntacticWalker => {
  let surfaces = new Map<string, Surface | null>();

  const resolveSpecifier = (
    specifier: Node,
    sourceFile: SourceFile,
  ): string | null => {
    if (!isStringLiteral(specifier)) {
      return null;
    }
    const resolved = host
      .program()
      .getResolvedModuleFromModuleSpecifier(specifier, sourceFile.fileName);
    if (resolved === undefined) {
      return null;
    }
    const file = host.repoRelative(resolved.resolvedFileName);
    return isRepositorySource(file) ? file : null;
  };

  const readSurface = (file: string): Surface | null => {
    const sourceFile = host.sourceFile(file);
    if (sourceFile === undefined) {
      return null;
    }
    const surface: Surface = {
      file,
      exports: new Map(),
      stars: [],
      references: [],
      modules: [],
    };
    /** Local names bound to `import * as ns`, with the file each stands for. */
    const namespaces = new Map<string, string>();
    const resolve = (specifier: Node): string | null =>
      resolveSpecifier(specifier, sourceFile);

    for (const statement of sourceFile.statements) {
      if (isImportDeclaration(statement)) {
        const from = resolve(statement.moduleSpecifier);
        if (from === null) {
          continue;
        }
        const clause = statement.importClause;
        if (clause === undefined) {
          surface.modules.push(from);
          continue;
        }
        if (clause.name !== undefined) {
          surface.references.push({ from, name: "default" });
        }
        const bindings = clause.namedBindings;
        if (bindings !== undefined && isNamespaceImport(bindings)) {
          namespaces.set(bindings.name.text, from);
          surface.modules.push(from);
        } else if (bindings !== undefined && isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            surface.references.push({
              from,
              name: (element.propertyName ?? element.name).text,
            });
          }
        }
      } else if (isExportDeclaration(statement)) {
        const from =
          statement.moduleSpecifier === undefined
            ? null
            : resolve(statement.moduleSpecifier);
        const clause = statement.exportClause;
        if (clause === undefined) {
          if (from !== null) {
            surface.stars.push(from);
          }
        } else if (isNamespaceExport(clause)) {
          if (from !== null) {
            surface.exports.set(clause.name.text, {
              kind: "local",
              name: clause.name.text,
            });
            surface.modules.push(from);
          }
        } else if (isNamedExports(clause)) {
          for (const element of clause.elements) {
            const original = (element.propertyName ?? element.name).text;
            if (from === null) {
              surface.exports.set(element.name.text, {
                kind: "local",
                name: original,
              });
            } else {
              surface.exports.set(element.name.text, {
                kind: "reexport",
                from,
                name: original,
              });
              surface.references.push({ from, name: original });
            }
          }
        }
      } else if (isExportAssignment(statement)) {
        surface.exports.set("default", { kind: "local", name: "default" });
      } else if (hasModifier(statement, SyntaxKind.ExportKeyword)) {
        const exportedAs = hasModifier(statement, SyntaxKind.DefaultKeyword)
          ? "default"
          : null;
        if (isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            for (const name of boundNames(declaration.name)) {
              surface.exports.set(name, { kind: "local", name });
            }
          }
        } else if (declarationKinds.has(statement.kind)) {
          const name = (statement as { name?: Node }).name;
          const exported =
            exportedAs ??
            (name !== undefined && isIdentifier(name) ? name.text : null);
          if (exported !== null) {
            surface.exports.set(exported, { kind: "local", name: exported });
          }
        }
      }
    }

    // Members read off a namespace import, in values (`ns.x`) and in types
    // (`ns.T`), reference the member the namespace's module exports.
    const visit = (node: Node): void => {
      if (
        isCallExpression(node) &&
        node.expression.kind === SyntaxKind.ImportKeyword
      ) {
        const [specifier] = node.arguments;
        const from = specifier === undefined ? null : resolve(specifier);
        if (from !== null) {
          surface.modules.push(from);
        }
      } else if (
        isPropertyAccessExpression(node) &&
        isIdentifier(node.expression) &&
        isIdentifier(node.name)
      ) {
        const from = namespaces.get(node.expression.text);
        if (from !== undefined) {
          surface.references.push({ from, name: node.name.text });
        }
      } else if (isQualifiedName(node) && isIdentifier(node.left)) {
        const from = namespaces.get(node.left.text);
        if (from !== undefined) {
          surface.references.push({ from, name: node.right.text });
        }
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
    return surface;
  };

  const surfaceOf = (file: string): Surface | null => {
    const known = surfaces.get(file);
    if (known !== undefined) {
      return known;
    }
    const surface = readSurface(file);
    surfaces.set(file, surface);
    return surface;
  };

  /** The file and name that declare `name` as exported from `file`. */
  const resolveExport = (
    file: string,
    name: string,
    seen: Set<string>,
  ): { file: string; name: string } | null => {
    const key = `${file}#${name}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    const surface = surfaceOf(file);
    if (surface === null) {
      return { file, name };
    }
    const origin = surface.exports.get(name);
    if (origin?.kind === "local") {
      return { file, name: origin.name };
    }
    if (origin?.kind === "reexport") {
      return resolveExport(origin.from, origin.name, seen);
    }
    for (const star of surface.stars) {
      const found = resolveExport(star, name, seen);
      if (found !== null) {
        return found;
      }
    }
    return null;
  };

  return {
    refresh: (file) => {
      surfaces.set(file, readSurface(file));
    },
    documents: (files) =>
      files.map((file): IndexedDocument => {
        const record = occurrenceRecorder();
        record(moduleSymbol(file), true);
        const surface = surfaceOf(file);
        if (surface === null) {
          return { file, occurrences: record.occurrences };
        }
        for (const origin of surface.exports.values()) {
          if (origin.kind === "local") {
            record(`${file}#${origin.name}`, true);
          }
        }
        for (const reference of surface.references) {
          const target = resolveExport(
            reference.from,
            reference.name,
            new Set(),
          );
          if (target !== null && target.file !== file) {
            record(`${target.file}#${target.name}`, false);
          }
        }
        for (const module of surface.modules) {
          record(moduleSymbol(module), false);
        }
        return { file, occurrences: record.occurrences };
      }),
    reset: () => {
      surfaces = new Map();
    },
  };
};
