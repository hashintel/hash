import { Array, Function, HashMap, Option, pipe } from "effect";

import * as AST from "../AST/index.js";
import * as Catalogue from "../Catalogue.js";
import * as Entry from "../Entry.js";
import * as Placement from "../Placement.js";
import * as Tree from "../Tree/index.js";

type Row = Tree.Row.Row;
type Local = AST.Interned.Interned<AST.Target.Local>;

/** What rows read besides the catalogue: where each export is documented and what its entry distilled. */
export interface Context {
  readonly catalogue: Catalogue.Catalogue;
  readonly placement: Placement.Placement;
  readonly entries: HashMap.HashMap<Catalogue.DeclarationId, Tree.Export.Own>;
  /** The export each documented member belongs to, by the member's identity. */
  readonly owners: HashMap.HashMap<AST.Node.Interned, Catalogue.DeclarationId>;
  /** The module page the rows are written on, where a label leaves out its module's name. On a page that is no module's, every label carries it. */
  readonly page: Option.Option<Placement.Page>;
}

/** The prose an index shows the first sentence of. */
export const summary = (
  comment: Option.Option<Tree.Comment.Comment>,
): Option.Option<readonly Tree.Prose.Block[]> =>
  Option.flatMap(comment, ({ description }) =>
    Option.map(description, ({ children }) => children),
  );

/** An entry's own name as its page's title shows it: the last name of its path, or the entrypoint for an entrypoint's root. */
export const titleOf = (entry: Catalogue.Entry): string =>
  Array.last(entry.name.path).pipe(
    Option.getOrElse(() => entry.name.entrypoint),
  );

/** The name a page's exports are qualified by on another page, such as `JExpr` for `JExpr.parse`. An entrypoint's root is named by the last part of its specifier. */
const moduleOf = (page: Placement.Page): string =>
  Array.last(page.entry.name.path).pipe(
    Option.getOrElse(() =>
      Array.lastNonEmpty(Catalogue.segmentsOf(page.entry.name.entrypoint)),
    ),
  );

/** The names a reader on the context's page sees for something placed at `place`. Another page's declaration carries its module's name, unless its first name is that name already. */
const labelOf = (
  place: Placement.Place,
  names: readonly string[],
  context: Context,
): Array.NonEmptyReadonlyArray<string> => {
  if (!Array.isReadonlyArrayNonEmpty(names)) {
    return [titleOf(place.page.entry)];
  }

  const qualifier = moduleOf(place.page);
  if (
    Option.exists(context.page, (page) => page === place.page) ||
    names[0] === qualifier
  ) {
    return names;
  }

  return Array.prepend(names, qualifier);
};

const placeOf = (
  id: Catalogue.DeclarationId,
  context: Context,
): Placement.Place =>
  HashMap.get(context.placement.places, id).pipe(Option.getOrThrow);

/** The export the reference distilled for a catalogued declaration. Every catalogued declaration has one. */
export const entryAt: {
  (
    context: Pick<Context, "entries">,
  ): (id: Catalogue.DeclarationId) => Tree.Export.Own;
  (
    id: Catalogue.DeclarationId,
    context: Pick<Context, "entries">,
  ): Tree.Export.Own;
} = Function.dual(
  2,
  (
    id: Catalogue.DeclarationId,
    context: Pick<Context, "entries">,
  ): Tree.Export.Own =>
    HashMap.get(context.entries, id).pipe(Option.getOrThrow),
);

const declarationRow = (id: Catalogue.DeclarationId, context: Context): Row => {
  const entry = entryAt(id, context);
  const place = placeOf(id, context);

  return {
    type: "row",
    kind: entry.kind,
    label: labelOf(place, place.names, context),
    depth: 0,
    summary: summary(Entry.summary(entry)),
    deprecated: entry.deprecated,
    origin: { _tag: "Reference", target: id },
  };
};

const memberRow = (
  member: Tree.Member.Member,
  owner: Catalogue.DeclarationId,
  context: Context,
): Row => {
  const place = placeOf(owner, context);

  return {
    type: "row",
    kind: member.type,
    label: labelOf(place, Array.append(place.names, member.name), context),
    depth: 0,
    summary: summary(Array.head(Tree.Member.comments(member))),
    deprecated: member.deprecated,
    origin: { _tag: "Reference", target: member.id },
  };
};

/** A row for a public declaration or one of its members, or none for a target that names neither. A member's row reads the member's own documentation rather than its owner's. */
export const row =
  (context: Context) =>
  (target: Local): Option.Option<Row> => {
    const { ast } = context.catalogue;
    const declaration = ast.narrow(target, AST.Declaration.isDeclaration);

    if (Option.isSome(declaration)) {
      return Option.some(declarationRow(declaration.value, context));
    }

    return HashMap.get(context.owners, target).pipe(
      Option.flatMap((owner) =>
        Array.findFirst(
          entryAt(owner, context).members,
          ({ id }) => id === target,
        ).pipe(Option.map((member) => memberRow(member, owner, context))),
      ),
    );
  };

/** The index of `exports` at `depth`. A canonical export documented on this page lists its members and its namespace's exports below it. */
export const listing =
  ({ context, depth }: { readonly context: Context; readonly depth: number }) =>
  (exports: readonly Placement.Export[]): readonly Row[] =>
    Array.flatMap(exports, (exported) => {
      const entry = entryAt(exported.target, context);
      const place = placeOf(exported.target, context);
      const own: Row = {
        type: "row",
        kind: entry.kind,
        label: [exported.name],
        depth,
        summary: summary(Entry.summary(entry)),
        deprecated: entry.deprecated,
        origin: { _tag: "Reference", target: exported.target },
      };
      if (
        !exported.canonical ||
        !Option.exists(context.page, (page) => page === place.page) ||
        place.names.length === 0
      ) {
        return [own];
      }

      const members = Array.map(entry.members, (member): Row => ({
        type: "row",
        kind: member.type,
        label: [member.name],
        depth: depth + 1,
        summary: summary(Array.head(Tree.Member.comments(member))),
        deprecated: member.deprecated,
        origin: { _tag: "Reference", target: member.id },
      }));
      const nested = pipe(
        Placement.exportsOf(context.catalogue, entry.origin),
        listing({ context, depth: depth + 1 }),
      );

      return Array.flatten([[own], members, nested]);
    });
