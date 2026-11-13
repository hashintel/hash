import {
  Array,
  Function,
  HashMap,
  Option,
  Result,
  Struct,
  Tuple,
  pipe,
} from "effect";

import * as Anchor from "./Anchor.js";
import * as Catalogue from "./Catalogue.js";
import * as Related from "./internal/related.js";
import * as Tree from "./Tree/index.js";

import type * as AST from "./AST/index.js";
import type * as Code from "./Code.js";
import type * as Document from "./Document.js";
import type * as ExternalTarget from "./ExternalTarget.js";
import type * as Placement from "./Placement.js";

type Target = AST.Target.Interned;

/**
 * Where the output writes each page and each node a link can name: a file per page, and an element id per export, member, group, index and trait.
 *
 * The tree holds none of these, so a link resolves through this index with the tree in hand. Ids are reserved in a fixed order, declarations before members before each page's headings, so a collision suffixes the later one.
 */
export interface Destinations {
  readonly overview: Anchor.File;
  readonly traits: Anchor.File;
  /** The file of each module page, by the entry the page documents. */
  readonly pages: HashMap.HashMap<Catalogue.DeclarationId, Anchor.File>;
  /** The anchor of each public declaration, keyed as any node is so a reference's target finds it directly. A page's own declaration has a file and no id. A type and a value declared apart are an export each, and this is the type's. */
  readonly declarations: HashMap.HashMap<AST.Node.Interned, Anchor.Anchor>;
  /** The anchors of each declaration whose type and value are an export each, by what a name that reads the declaration means. */
  readonly meanings: HashMap.HashMap<
    AST.Node.Interned,
    Readonly<Record<ExternalTarget.Meaning, Anchor.Anchor>>
  >;
  readonly members: HashMap.HashMap<AST.Node.Interned, Anchor.Anchor>;
  /** The id of each group's heading on its module page, by the page's entry and the group's grouping. A group that only links elsewhere has none. */
  readonly groups: HashMap.HashMap<
    Catalogue.DeclarationId,
    HashMap.HashMap<Tree.Page.Grouping, Anchor.AnchorId>
  >;
  /** The id of each module page's index heading. */
  readonly indexes: HashMap.HashMap<Catalogue.DeclarationId, Anchor.AnchorId>;
  /** Each trait's anchor on the traits page, with the target that names it. */
  readonly traitAnchors: readonly (readonly [Target, Anchor.Anchor])[];
}

/** A page's path: its entrypoint without the scope, then its names below the entrypoint. */
const pathOf = (page: Placement.Page): Anchor.Path => {
  const { entrypoint, path } = page.entry.name;

  return Array.appendAll(Catalogue.segmentsOf(entrypoint), path);
};

const moduleOf = (page: Tree.Page.Page): Option.Option<Tree.Page.Module> =>
  Option.liftPredicate(
    page,
    (candidate): candidate is Tree.Page.Module => candidate.type === "module",
  );

const traitsOf = (
  pages: readonly Tree.Page.Page[],
): readonly Tree.Trait.Trait[] =>
  Array.flatMap(pages, (page) => (page.type === "traits" ? page.traits : []));

type Pages = HashMap.HashMap<Catalogue.DeclarationId, Anchor.File>;

interface Placed {
  readonly id: Catalogue.DeclarationId;
  readonly place: Placement.Place;
  readonly anchor: Anchor.Anchor;
  /** The anchor of the declaration's value, where that is an export of its own. */
  readonly value: Option.Option<Anchor.Anchor>;
}

/** Every public declaration's anchor on the page that documents it, in catalogue order. A page's own declaration has its file and no id. A value that is an export of its own takes its type's id with `-value` after it. */
const declarationsOf = (
  document: Document.Document,
  { pages, ids }: { readonly pages: Pages; readonly ids: Anchor.Ids },
): readonly Placed[] =>
  Array.flatMap(document.catalogue.entries, ({ id }) =>
    HashMap.get(document.placement.places, id).pipe(
      Option.map((place): Placed => {
        const file = HashMap.get(pages, place.page.entry.id).pipe(
          Option.getOrThrow,
        );
        const anchored = (suffix: string): Anchor.Anchor => ({
          file,
          id: Option.liftPredicate(
            place.names,
            Array.isReadonlyArrayNonEmpty,
          ).pipe(
            Option.map((names) =>
              ids.reserve(file, Anchor.AnchorId(`${names.join(".")}${suffix}`)),
            ),
          ),
        });

        return {
          id,
          place,
          anchor: anchored(""),
          value: HashMap.get(document.values, id).pipe(
            Option.map(() => anchored("-value")),
          ),
        };
      }),
      Option.toArray,
    ),
  );

/** The anchors of each declaration whose type and value are an export each. A name reads the export `Related.exportAt` gives its meaning, and links to that export's anchor. */
const meaningsOf = (
  document: Document.Document,
  placed: readonly Placed[],
): Destinations["meanings"] =>
  HashMap.fromIterable(
    Array.flatMap(placed, ({ id, anchor, value }) =>
      Array.map(Option.toArray(value), (apart) => {
        const read = (meaning: ExternalTarget.Meaning): Anchor.Anchor =>
          Related.exportAt({ id, meaning }, document).meaning.pipe(
            Option.contains("value"),
          )
            ? apart
            : anchor;

        return [
          id,
          {
            type: read("type"),
            value: read("value"),
            namespace: read("namespace"),
          },
        ] as const;
      }),
    ),
  );

/** Every documented member's anchor beside its owner's, named by the owner's names and its own. */
const membersOf = (
  document: Document.Document,
  {
    placed,
    ids,
  }: { readonly placed: readonly Placed[]; readonly ids: Anchor.Ids },
): readonly (readonly [AST.Node.Interned, Anchor.Anchor])[] =>
  Array.flatMap(placed, ({ id, place, anchor }) =>
    pipe(
      HashMap.get(document.entries, id),
      Option.toArray,
      Array.flatMap(({ members }) => members),
      Array.map((member): readonly [AST.Node.Interned, Anchor.Anchor] => [
        member.id,
        {
          file: anchor.file,
          id: Option.some(
            ids.reserve(
              anchor.file,
              Anchor.AnchorId(Array.append(place.names, member.name).join(".")),
            ),
          ),
        },
      ]),
    ),
  );

interface Headings {
  readonly id: Catalogue.DeclarationId;
  readonly groups: HashMap.HashMap<Tree.Page.Grouping, Anchor.AnchorId>;
  readonly index: Anchor.AnchorId;
}

/** Each module page's group headings, for the groups it documents, then its index heading. */
const headingsOf = (
  document: Document.Document,
  { pages, ids }: { readonly pages: Pages; readonly ids: Anchor.Ids },
): readonly Headings[] =>
  pipe(
    document.pages,
    Array.flatMap((page) => Option.toArray(moduleOf(page))),
    Array.map((page): Headings => {
      const file = HashMap.get(pages, page.origin.id).pipe(Option.getOrThrow);
      const groups = Array.flatMap(page.groups, (group) => {
        if (group.exports.length === 0) {
          return [];
        }

        const slug = Tree.Page.slugOf(group.grouping);

        return [
          [
            group.grouping,
            ids.reserve(file, Anchor.AnchorId(`category-${slug}`)),
          ] as const,
        ];
      });

      return {
        id: page.origin.id,
        groups: HashMap.fromIterable(groups),
        index: ids.reserve(file, Anchor.AnchorId("page-index")),
      };
    }),
  );

/** Each trait's anchor on the traits page, by its name. */
const traitAnchorsOf = (
  document: Document.Document,
  file: Anchor.File,
): Destinations["traitAnchors"] => {
  const ids = Anchor.ids([]);

  return Array.map(
    traitsOf(document.pages),
    (trait): readonly [Target, Anchor.Anchor] => [
      trait.origin,
      { file, id: Option.some(ids.reserve(file, Anchor.AnchorId(trait.name))) },
    ],
  );
};

/** Assigns every file and element id of the reference, failing before any page is written when two pages would share a file. */
export const collect = (
  document: Document.Document,
): Result.Result<Destinations, Anchor.AnchorError> =>
  Result.gen(function* () {
    const { placement } = document;
    const files = yield* Anchor.files(
      Array.prependAll(Array.map(placement.pages, pathOf), [[], ["traits"]]),
    );
    const fileAt = (path: Anchor.Path): Anchor.File =>
      HashMap.get(files, path).pipe(Option.getOrThrow);
    const pages: Pages = HashMap.fromIterable(
      Array.map(
        placement.pages,
        (page) => [page.entry.id, fileAt(pathOf(page))] as const,
      ),
    );
    const ids = Anchor.ids([]);
    const placed = declarationsOf(document, { pages, ids });
    const members = membersOf(document, { placed, ids });
    const headings = headingsOf(document, { pages, ids });
    const traits = fileAt(["traits"]);

    return {
      overview: fileAt([]),
      traits,
      pages,
      declarations: HashMap.fromIterable(
        Array.map(
          placed,
          ({ id, anchor }): readonly [AST.Node.Interned, Anchor.Anchor] => [
            id,
            anchor,
          ],
        ),
      ),
      meanings: meaningsOf(document, placed),
      members: HashMap.fromIterable(members),
      groups: HashMap.fromIterable(
        Array.map(headings, ({ id, groups }) => [id, groups] as const),
      ),
      indexes: HashMap.fromIterable(
        Array.map(headings, ({ id, index }) => [id, index] as const),
      ),
      traitAnchors: traitAnchorsOf(document, traits),
    };
  });

/** The anchor of the public declaration or documented member `target` names, as a name with `meaning` reads it. A private declaration and an item outside the package have none. */
export const local: {
  (
    link: Pick<Code.Link, "target" | "meaning">,
  ): (destinations: Destinations) => Option.Option<Anchor.Anchor>;
  (
    destinations: Destinations,
    link: Pick<Code.Link, "target" | "meaning">,
  ): Option.Option<Anchor.Anchor>;
} = Function.dual(
  2,
  (
    destinations: Destinations,
    { target, meaning }: Pick<Code.Link, "target" | "meaning">,
  ): Option.Option<Anchor.Anchor> =>
    HashMap.get(destinations.members, target).pipe(
      Option.orElse(() =>
        HashMap.get(destinations.meanings, target).pipe(
          Option.map(Struct.get(meaning)),
        ),
      ),
      Option.orElse(() => HashMap.get(destinations.declarations, target)),
    ),
);

/** The anchor of a trait on the traits page. */
export const trait: {
  (
    target: Target,
  ): (destinations: Destinations) => Option.Option<Anchor.Anchor>;
  (destinations: Destinations, target: Target): Option.Option<Anchor.Anchor>;
} = Function.dual(
  2,
  (destinations: Destinations, target: Target): Option.Option<Anchor.Anchor> =>
    pipe(
      destinations.traitAnchors,
      Array.findFirst(([candidate]) => candidate === target),
      Option.map(Tuple.get(1)),
    ),
);
