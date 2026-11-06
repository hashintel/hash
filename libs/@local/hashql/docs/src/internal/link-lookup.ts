import { Array, Option, pipe } from "effect";

import * as Catalogue from "../Catalogue.js";
import * as Parts from "./parts.js";

import type * as AST from "../AST/index.js";
import type { DocDeclarationReference } from "@microsoft/tsdoc";

type Local = Extract<
  AST.Reference.Reference.Target,
  { readonly _tag: "Local" }
>;

/** Where a comment's names resolve: below its owner's public name, or nowhere for a comment whose owner has none. */
export interface Scope {
  readonly catalogue: Catalogue.Catalogue;
  readonly owner: Option.Option<Catalogue.Name>;
}

/** The only member of an export that `name` spells. Static and instance members may share a spelling, which then names neither. */
const memberOf = (
  catalogue: Catalogue.Catalogue,
  name: Catalogue.Name,
): Option.Option<Local> =>
  Option.gen(function* () {
    const memberName = yield* Array.last(name.path);
    const entry = yield* Catalogue.lookup(catalogue, {
      entrypoint: name.entrypoint,
      path: Array.dropRight(name.path, 1),
    });
    const owner = { ast: catalogue.ast, entry };
    const matches = pipe(
      Parts.of(catalogue.ast, entry),
      Parts.members(owner),
      Array.filter((member) => member.name === memberName),
    );
    const member = yield* Array.head(matches).pipe(
      Option.filter(() => matches.length === 1),
    );

    return { _tag: "Local", node: member.id } satisfies Local;
  });

/** The export a public name spells, or else the member it spells below an export. */
const named = (
  catalogue: Catalogue.Catalogue,
  name: Catalogue.Name,
): Option.Option<Local> =>
  Catalogue.lookup(catalogue, name).pipe(
    Option.map(({ id }): Local => ({ _tag: "Local", node: id })),
    Option.orElse(() => memberOf(catalogue, name)),
  );

/** What `path` names inside the owner, or else in each enclosing namespace outwards. */
const scoped = (
  { catalogue, owner }: Scope,
  path: readonly string[],
): Option.Option<Local> =>
  Option.flatMap(owner, ({ entrypoint, path: namespace }) =>
    pipe(
      Array.makeBy(namespace.length + 1, (depth) =>
        Array.dropRight(namespace, depth),
      ),
      Array.findFirst((enclosing) =>
        named(catalogue, {
          entrypoint,
          path: Array.appendAll(enclosing, path),
        }),
      ),
    ),
  );

/** What a TSDoc declaration reference names. A package-qualified reference starts at that entrypoint, any other in the scope. */
export const reference =
  (scope: Scope) =>
  (destination: DocDeclarationReference): Option.Option<Local> =>
    pipe(
      destination.memberReferences,
      Array.map((member) =>
        Option.fromUndefinedOr(member.memberIdentifier?.identifier),
      ),
      Option.all,
      Option.flatMap((path) => {
        if (destination.packageName === undefined) {
          return scoped(scope, path);
        }

        return named(scope.catalogue, {
          entrypoint: `${destination.packageName}${destination.importPath ?? ""}`,
          path,
        });
      }),
    );
