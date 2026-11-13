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
  /** The place of each declaration's value where its canonical name is type-only and another name permits value use. That place documents a value declared apart from its type. */
  readonly values: HashMap.HashMap<Catalogue.DeclarationId, Place>;
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

/** A name a namespace exports, with the entry whose namespace it is. */
export interface Spelled {
  readonly owner: Catalogue.Entry;
  readonly exported: Export;
}

/** Whether the name is its declaration's shortest that permits value use. Such a namespace documents a value declared apart from its type. */
export const namesValue: {
  (spelled: Spelled): (catalogue: Catalogue.Catalogue) => boolean;
  (catalogue: Catalogue.Catalogue, spelled: Spelled): boolean;
} = Function.dual(
  2,
  (catalogue: Catalogue.Catalogue, { owner, exported }: Spelled): boolean =>
    HashMap.get(catalogue.byId, exported.target).pipe(
      Option.flatMap(({ valueName }) => valueName),
      Option.exists((name) =>
        Equal.equals(name, {
          entrypoint: owner.name.entrypoint,
          path: Array.append(owner.name.path, exported.name),
        }),
      ),
    ),
);

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

/** The deepest of `pages` whose name contains `name`, with the names below it, or none where no page of the name's entrypoint does. */
const placed = (
  pages: readonly Page[],
  name: Catalogue.Name,
): Option.Option<Place> =>
  pipe(
    pages,
    Array.filter(
      (page) =>
        page.entry.name.entrypoint === name.entrypoint && contains(page, name),
    ),
    Option.liftPredicate(Array.isReadonlyArrayNonEmpty<Page>),
    Option.map(Array.max(depth)),
    Option.map((page) => ({
      page,
      names: Array.drop(name.path, page.entry.name.path.length),
    })),
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
      for (const place of Option.toArray(placed(local, entry.name))) {
        MutableHashMap.set(places, entry.id, place);
      }
    }
  }

  const pages = Array.appendAll(roots, modules);

  return {
    pages,
    places: HashMap.fromIterable(places),
    // A value's name can lie in another entrypoint than its declaration's canonical name, so its place is among all pages.
    values: HashMap.fromIterable(
      Array.flatMap(catalogue.entries, (entry) =>
        pipe(
          entry.valueName,
          Option.filter((name) => !Equal.equals(name, entry.name)),
          Option.flatMap((name) => placed(pages, name)),
          Option.map((place) => [entry.id, place] as const),
          Option.toArray,
        ),
      ),
    ),
  };
};

/** An export, by its declaration and the meaning of its name it documents alone, if it documents one alone. */
export interface Documented {
  readonly id: Catalogue.DeclarationId;
  readonly meaning: Option.Option<"type" | "value">;
}

/** The place of an export. A value declared apart from its type has its own where its declaration's canonical name is type-only. */
export const placeOf: {
  (documented: Documented): (placement: Placement) => Option.Option<Place>;
  (placement: Placement, documented: Documented): Option.Option<Place>;
} = Function.dual(
  2,
  (placement: Placement, { id, meaning }: Documented): Option.Option<Place> =>
    pipe(
      meaning,
      Option.filter((documented) => documented === "value"),
      Option.flatMap(() => HashMap.get(placement.values, id)),
      Option.orElse(() => HashMap.get(placement.places, id)),
    ),
);
