import {
  Array,
  Equal,
  Function,
  HashMap,
  MutableHashMap,
  Option,
  Order,
  pipe,
} from "effect";

import type * as AST from "./AST/index.js";
import type * as Catalogue from "./Catalogue.js";

/** One name a namespace exports. An alias keeps its own spelling and restriction while naming the declaration's canonical entry. */
export interface Export {
  readonly name: string;
  readonly target: Catalogue.DeclarationId;
  readonly typeOnlyExport: boolean;
  /** The alias is the declaration's canonical name, so the namespace documents the declaration rather than only listing it. */
  readonly canonical: boolean;
}

/** A page of the reference: an entrypoint's root, or a declaration that is only a namespace. A namespace merged with another declaration stays beside it on that declaration's page. */
export interface Page {
  readonly entry: Catalogue.Entry;
  readonly kind: "module" | "entrypoint";
  /** The namespace the page documents, which the entry's declaration is. */
  readonly namespace: AST.NamespaceDeclaration.NamespaceDeclaration;
  readonly exports: readonly Export[];
}

/** The page that documents a public declaration, and the declaration's names below the page's own. A page's own entry has no names below it. */
export interface Place {
  readonly page: Page;
  readonly names: readonly string[];
}

/** Every public declaration's page. Every public name of a declaration shares the place of its canonical name. */
export interface Placement {
  /** Every entrypoint's root in the catalogue's order, then each entrypoint's modules, so a host's navigation lists the entrypoints before the modules below them. */
  readonly pages: readonly Page[];
  readonly places: HashMap.HashMap<Catalogue.DeclarationId, Place>;
}

const exportsOfEntry = (
  catalogue: Catalogue.Catalogue,
  entry: Catalogue.Entry,
): readonly Export[] => {
  const { ast } = catalogue;

  return pipe(
    ast.get(entry.id).namespace,
    Option.map(ast.get),
    Option.toArray,
    Array.flatMap(({ exports }) => Array.fromIterable(exports)),
    Array.map((id): Export => {
      const alias = ast.get(id);

      return {
        name: alias.name,
        target: alias.target,
        typeOnlyExport: alias.typeOnlyExport,
        canonical: HashMap.get(catalogue.byId, alias.target).pipe(
          Option.exists(({ name }) =>
            Equal.equals(name, {
              entrypoint: entry.name.entrypoint,
              path: Array.append(entry.name.path, alias.name),
            }),
          ),
        ),
      };
    }),
  );
};

/** The names an entry's namespace exports, in declaration order, each marked canonical when it is the declaration's catalogued name. */
export const exportsOf: {
  (
    entry: Catalogue.Entry,
  ): (catalogue: Catalogue.Catalogue) => readonly Export[];
  (catalogue: Catalogue.Catalogue, entry: Catalogue.Entry): readonly Export[];
} = Function.dual(2, exportsOfEntry);

/** Whether `page`'s name is a prefix of `name`, so the page contains it. */
const contains = (page: Page, name: Catalogue.Name): boolean =>
  Array.every(page.entry.name.path, (part, index) => name.path[index] === part);

/** The page of an entry whose declaration is a namespace, or none for one that is not. */
const pageOf = (
  catalogue: Catalogue.Catalogue,
  entry: Catalogue.Entry,
  kind: Page["kind"],
): Option.Option<Page> =>
  catalogue.ast.get(entry.id).namespace.pipe(
    Option.map(catalogue.ast.get),
    Option.map((namespace): Page => ({
      entry,
      kind,
      namespace,
      exports: exportsOfEntry(catalogue, entry),
    })),
  );

const depth = Order.mapInput(
  Order.Number,
  (page: Page) => page.entry.name.path.length,
);

/** Places every public declaration on the deepest page whose name contains its own, by public path rather than by source file. The entrypoints' pages come first, then the modules' below them. */
export const collect = (catalogue: Catalogue.Catalogue): Placement => {
  const roots: Page[] = [];
  const modules: Page[] = [];
  const places = MutableHashMap.empty<Catalogue.DeclarationId, Place>();

  for (const [entrypoint, id] of catalogue.entrypoints) {
    const own = Array.filter(
      catalogue.entries,
      ({ name }) => name.entrypoint === entrypoint,
    );
    const root = HashMap.get(catalogue.byId, id).pipe(
      Option.filter(({ name }) => name.path.length === 0),
      Option.flatMap((entry) => pageOf(catalogue, entry, "entrypoint")),
      Option.toArray,
    );
    // A declaration that is only a namespace gets a page of its own. One that also declares something keeps its namespace beside it.
    const namespaces = Array.flatMap(own, (entry): readonly Page[] => {
      if (
        entry.name.path.length === 0 ||
        Option.isSome(catalogue.ast.get(entry.id).leaf)
      ) {
        return [];
      }

      return Option.toArray(pageOf(catalogue, entry, "module"));
    });
    const local = Array.appendAll(root, namespaces);
    roots.push(...root);
    modules.push(...namespaces);

    for (const entry of own) {
      const deepest = pipe(
        local,
        Array.filter((page) => contains(page, entry.name)),
        Option.liftPredicate(Array.isReadonlyArrayNonEmpty<Page>),
        Option.map(Array.max(depth)),
      );

      for (const page of Option.toArray(deepest)) {
        MutableHashMap.set(places, entry.id, {
          page,
          names: Array.drop(entry.name.path, page.entry.name.path.length),
        });
      }
    }
  }

  return {
    pages: Array.appendAll(roots, modules),
    places: HashMap.fromIterable(places),
  };
};
