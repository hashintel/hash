import {
  Array,
  Function,
  HashMap,
  HashSet,
  MutableHashMap,
  Option,
  String,
  pipe,
} from "effect";

import type * as AST from "./AST/index.js";

/** An entrypoint's specifier without its package's scope, such as `hashql`, `Draft` for `@local/hashql/Draft`. */
export const segmentsOf = (
  entrypoint: string,
): Array.NonEmptyReadonlyArray<string> => {
  const [first, ...rest] = String.split(entrypoint, "/");

  if (first.startsWith("@") && Array.isReadonlyArrayNonEmpty(rest)) {
    return rest;
  }

  return [first, ...rest];
};

/** A public spelling consists of its package entrypoint and the names below it. */
export interface Name {
  readonly entrypoint: string;
  readonly path: readonly string[];
}

export type DeclarationId = AST.Declaration.Interned;

/** One declaration's canonical public name and its combined exposure through every export path. */
export interface Entry {
  readonly id: DeclarationId;
  readonly name: Name;
  /** The canonical spelling's restriction, used when displaying or importing that spelling. */
  readonly nameTypeOnlyExport: boolean;
  /** False if any public path permits value use. Each alias retains its own restriction in the AST. */
  readonly typeOnlyExport: boolean;
}

/**
 * The public declarations reachable from the AST's entrypoints.
 *
 * Private declarations discovered through type references remain in the AST but do not enter this catalogue. Entrypoints sort by name. Exports keep declaration order. The first path to a declaration is its canonical name, with entrypoint roots taking precedence over re-exports of those roots.
 */
export interface Catalogue {
  readonly ast: AST.Store["Service"];
  readonly entrypoints: readonly (readonly [name: string, id: DeclarationId])[];
  readonly entries: readonly Entry[];
  readonly byId: HashMap.HashMap<DeclarationId, Entry>;
  /** Includes alternate paths below namespace aliases. A cycle contributes its closing name but is not expanded again. */
  readonly byName: HashMap.HashMap<Name, DeclarationId>;
}

interface Pending {
  readonly id: DeclarationId;
  readonly name: Name;
  readonly typeOnlyExport: boolean;
  readonly ancestors: HashSet.HashSet<DeclarationId>;
}

/** Collects public names without consulting the compiler or visiting package-private declarations. */
export const fromAST = (ast: AST.Store["Service"]): Catalogue => {
  const entrypoints = pipe(
    ast.entrypoints,
    Array.fromIterable,
    Array.sortWith(
      ([name]: readonly [string, DeclarationId]) => name,
      String.Order,
    ),
  );

  const byId = MutableHashMap.empty<DeclarationId, Entry>();
  const byName = MutableHashMap.empty<Name, DeclarationId>();

  const roots: Pending[] = Array.map(entrypoints, ([entrypoint, id]) => ({
    id,
    name: { entrypoint, path: [] },
    typeOnlyExport: false,
    ancestors: HashSet.empty(),
  }));

  for (const { id, name, typeOnlyExport } of roots) {
    if (!MutableHashMap.has(byId, id)) {
      MutableHashMap.set(byId, id, {
        id,
        name,
        nameTypeOnlyExport: typeOnlyExport,
        typeOnlyExport,
      });
    }
  }

  const pending = Array.reverse(roots);
  const visit = ({ id, name, typeOnlyExport, ancestors }: Pending): void => {
    MutableHashMap.set(byName, name, id);
    const previous = MutableHashMap.get(byId, id);

    if (Option.isNone(previous)) {
      MutableHashMap.set(byId, id, {
        id,
        name,
        nameTypeOnlyExport: typeOnlyExport,
        typeOnlyExport,
      });
    } else if (previous.value.typeOnlyExport && !typeOnlyExport) {
      MutableHashMap.set(byId, id, {
        id,
        name: previous.value.name,
        nameTypeOnlyExport: previous.value.nameTypeOnlyExport,
        typeOnlyExport,
      });
    }

    if (HashSet.has(ancestors, id)) {
      return;
    }

    const namespace = ast.get(id).namespace.pipe(Option.map(ast.get));
    if (Option.isNone(namespace)) {
      return;
    }

    const visited = HashSet.add(ancestors, id);
    const exported = pipe(
      namespace.value.exports,
      Array.fromIterable,
      Array.reverse,
    );

    for (const aliasId of exported) {
      const alias = ast.get(aliasId);
      pending.push({
        id: alias.target,
        name: {
          entrypoint: name.entrypoint,
          path: Array.append(name.path, alias.name),
        },
        typeOnlyExport: typeOnlyExport || alias.typeOnlyExport,
        ancestors: visited,
      });
    }
  };

  while (pending.length > 0) {
    const current = pending.pop();
    if (current !== undefined) {
      visit(current);
    }
  }

  return {
    ast,
    entrypoints,
    entries: pipe(
      byId,
      Array.fromIterable,
      Array.map(([, entry]) => entry),
    ),
    byId: HashMap.fromIterable(byId),
    byName: HashMap.fromIterable(byName),
  };
};

/** Resolves a finite export path, including paths that cross a namespace cycle more than once. */
export const lookup: {
  (name: Name): (catalogue: Catalogue) => Option.Option<Entry>;
  (catalogue: Catalogue, name: Name): Option.Option<Entry>;
} = Function.dual(2, (catalogue: Catalogue, name: Name) =>
  Option.gen(function* () {
    const { ast } = catalogue;
    let id = yield* HashMap.get(ast.entrypoints, name.entrypoint);

    for (const member of name.path) {
      const namespaceId = yield* ast.get(id).namespace;
      const namespace = ast.get(namespaceId);

      const alias = yield* pipe(
        namespace.exports,
        Array.fromIterable,
        Array.map(ast.get),
        Array.findFirst((exported) => exported.name === member),
      );

      id = alias.target;
    }

    return yield* HashMap.get(catalogue.byId, id);
  }),
);
