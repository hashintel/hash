import { Array, Function, Option } from "effect";
import { SyntaxKind, createScanner, isIdentifierText } from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as Catalogue from "./Catalogue.js";
import * as Symbol from "./TypeScript/Symbol.js";

/** Binds a canonical import's first path component, leaving nested names under that binding. */
export interface Import {
  readonly module: string;
  readonly imported: Option.Option<string>;
  readonly binding: string;
  readonly typeOnly: boolean;
}

const bindingOf = (name: string): string => {
  const scanner = createScanner(true, undefined, name);
  if (
    isIdentifierText(name) &&
    scanner.scan() === SyntaxKind.Identifier &&
    scanner.scan() === SyntaxKind.EndOfFile &&
    name !== "eval" &&
    name !== "arguments"
  ) {
    return name;
  }
  return "api";
};

/** Uses the canonical path's restriction, even when another alias permits value use. */
export const fromEntry: {
  (catalogue: Catalogue.Catalogue): (entry: Catalogue.Entry) => Import;
  (entry: Catalogue.Entry, catalogue: Catalogue.Catalogue): Import;
} = Function.dual(
  2,
  (entry: Catalogue.Entry, catalogue: Catalogue.Catalogue): Import => {
    const imported = Option.fromUndefinedOr(entry.name.path[0]);
    const preferred = Option.getOrElse(imported, () =>
      Array.lastNonEmpty(Catalogue.segmentsOf(entry.name.entrypoint)),
    );
    return {
      module: entry.name.entrypoint,
      imported,
      binding: bindingOf(preferred),
      typeOnly:
        entry.nameTypeOnlyExport ||
        !Symbol.hasFlag(catalogue.ast.get(entry.id).symbol, SymbolFlags.Value),
    };
  },
);

/** Produces copyable TypeScript without introducing output-format nodes. */
export const print = (value: Import): string => {
  let names = `* as ${value.binding}`;
  if (Option.isSome(value.imported)) {
    const imported = value.imported.value;
    let specifier = imported;
    if (imported !== value.binding) {
      specifier = `${JSON.stringify(imported)} as ${value.binding}`;
    }
    names = `{ ${specifier} }`;
  }
  const phase = value.typeOnly ? " type" : "";
  return `import${phase} ${names} from ${JSON.stringify(value.module)};`;
};
