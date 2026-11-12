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
 * Private declarations discovered through type references remain in the AST but do not enter this catalogue. Entrypoints sort by name. Exports keep declaration order. The shortest path to a declaration is its canonical name, and among paths of one length the first in that order. An entrypoint's root and the names below it take precedence over the paths through a re-export of that root.
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
  /** The path crosses a re-export of an entrypoint's root, so the names below that root are the canonical ones. */
  readonly reexported: boolean;
}

/** Gives a declaration its entry at the shortest path that may name it, the first of them where two are as short, and lifts the entry's restriction once a path permits value use. */
const record = (
  byId: MutableHashMap.MutableHashMap<DeclarationId, Entry>,
  { id, name, typeOnlyExport, reexported }: Pending,
): void => {
  const previous = MutableHashMap.get(byId, id);

  if (Option.isNone(previous)) {
    if (!reexported) {
      MutableHashMap.set(byId, id, {
        id,
        name,
        nameTypeOnlyExport: typeOnlyExport,
        typeOnlyExport,
      });
    }
  } else if (
    !reexported &&
    name.path.length < previous.value.name.path.length
  ) {
    MutableHashMap.set(byId, id, {
      id,
      name,
      nameTypeOnlyExport: typeOnlyExport,
      typeOnlyExport: previous.value.typeOnlyExport && typeOnlyExport,
    });
  } else if (previous.value.typeOnlyExport && !typeOnlyExport) {
    MutableHashMap.set(byId, id, { ...previous.value, typeOnlyExport });
  }
};

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
    reexported: false,
  }));
  const rootIds = HashSet.fromIterable(Array.map(roots, ({ id }) => id));

  for (const root of roots) {
    record(byId, root);
  }

  const pending = Array.reverse(roots);
  const visit = (current: Pending): void => {
    const { id, name, typeOnlyExport, ancestors, reexported } = current;
    MutableHashMap.set(byName, name, id);
    record(byId, current);

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
        reexported: reexported || HashSet.has(rootIds, alias.target),
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

/** The declaration a finite export path ends at, and whether an export along the path is type-only. A path may cross a namespace cycle more than once. */
const walk = (
  ast: AST.Store["Service"],
  name: Name,
): Option.Option<{
  readonly id: DeclarationId;
  readonly typeOnlyExport: boolean;
}> =>
  Option.gen(function* () {
    let id = yield* HashMap.get(ast.entrypoints, name.entrypoint);
    let typeOnlyExport = false;

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
      typeOnlyExport ||= alias.typeOnlyExport;
    }

    return { id, typeOnlyExport };
  });

/** Resolves a finite export path, including paths that cross a namespace cycle more than once. */
export const lookup: {
  (name: Name): (catalogue: Catalogue) => Option.Option<Entry>;
  (catalogue: Catalogue, name: Name): Option.Option<Entry>;
} = Function.dual(2, (catalogue: Catalogue, name: Name) =>
  Option.flatMap(walk(catalogue.ast, name), ({ id }) =>
    HashMap.get(catalogue.byId, id),
  ),
);

/** One name a namespace exports a declaration under. */
export interface ExportName {
  readonly name: string;
  /** An export on the path to the name is type-only. */
  readonly typeOnlyExport: boolean;
}

/** Every name the namespace holding an entry's canonical name exports its declaration under, in declaration order. An entrypoint's own entry has none. */
export const namesOf: {
  (entry: Entry): (ast: AST.Store["Service"]) => readonly ExportName[];
  (ast: AST.Store["Service"], entry: Entry): readonly ExportName[];
} = Function.dual(2, (ast: AST.Store["Service"], entry: Entry) =>
  pipe(
    Array.init(entry.name.path),
    Option.flatMap((path) =>
      walk(ast, { entrypoint: entry.name.entrypoint, path }),
    ),
    Option.flatMap(({ id, typeOnlyExport }) =>
      Option.map(ast.get(id).namespace, (namespace) =>
        pipe(
          ast.get(namespace).exports,
          Array.fromIterable,
          Array.map(ast.get),
          Array.filter(({ target }) => target === entry.id),
          Array.map((alias): ExportName => ({
            name: alias.name,
            typeOnlyExport: typeOnlyExport || alias.typeOnlyExport,
          })),
        ),
      ),
    ),
    Option.getOrElse((): readonly ExportName[] => []),
  ),
);
