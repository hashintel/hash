import { Array, Equivalence, Option, String, pipe } from "effect";

import * as Catalogue from "../Catalogue.js";
import * as Parts from "./parts.js";

import type * as AST from "../AST/index.js";
import type { DocDeclarationReference } from "@microsoft/tsdoc";

type Local = AST.Interned.Interned<AST.Target.Local>;

/** Where a comment's names resolve: below its owner's public name, or nowhere for a comment whose owner has none. */
export interface Scope {
  readonly catalogue: Catalogue.Catalogue;
  readonly owner: Option.Option<Catalogue.Name>;
}

const samePath = Array.makeEquivalence(Equivalence.strictEqual<string>());

const isIdentifier = (text: string): boolean =>
  /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u.test(text);

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

    return member.id;
  });

/** The export a public name spells, or else the member it spells below an export. */
const named = (
  catalogue: Catalogue.Catalogue,
  name: Catalogue.Name,
): Option.Option<Local> =>
  Catalogue.lookup(catalogue, name).pipe(
    Option.map(({ id }): Local => id),
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

/** The entrypoint a package-qualified reference starts at, which is its package name and import path together. */
export const entrypointOf = (
  destination: DocDeclarationReference,
): Option.Option<string> =>
  Option.map(
    Option.fromUndefinedOr(destination.packageName),
    (name) => `${name}${destination.importPath ?? ""}`,
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
      Option.flatMap((path) =>
        Option.match(entrypointOf(destination), {
          onNone: () => scoped(scope, path),
          onSome: (entrypoint) => named(scope.catalogue, { entrypoint, path }),
        }),
      ),
    );

/** The path a code span spells when it starts with a qualified name, such as `Tools.make`, `Tools.make(1)` or `Tools.Item<string>`. The type arguments or the call after the name are no part of the path. */
const qualifiedName = (
  code: string,
): Option.Option<Array.NonEmptyReadonlyArray<string>> =>
  pipe(
    code,
    String.replace(/[<(].*$/su, ""),
    String.split("."),
    Option.liftPredicate(
      (path: Array.NonEmptyReadonlyArray<string>) =>
        path.length > 1 && Array.every(path, isIdentifier),
    ),
  );

/** Every export or member whose public path ends with `path`, in any namespace of any entrypoint. */
const ending = (
  catalogue: Catalogue.Catalogue,
  path: Array.NonEmptyReadonlyArray<string>,
): readonly Local[] =>
  pipe(
    catalogue.byName,
    Array.fromIterable,
    Array.flatMap(([name, id]): readonly Local[] => {
      if (samePath(Array.takeRight(name.path, path.length), path)) {
        return [id];
      }

      if (
        !samePath(
          Array.takeRight(name.path, path.length - 1),
          Array.initNonEmpty(path),
        )
      ) {
        return [];
      }

      return Option.toArray(
        memberOf(catalogue, {
          entrypoint: name.entrypoint,
          path: Array.append(name.path, Array.lastNonEmpty(path)),
        }),
      );
    }),
    Array.dedupe,
  );

/**
 * The public APIs a code span may mention.
 *
 * A qualified name means what it resolves to in the scope. One that resolves nowhere there may still mean any export or member whose public path ends with it.
 */
export const mentioned =
  (scope: Scope) =>
  (code: string): readonly Local[] =>
    Option.match(qualifiedName(code), {
      onNone: () => [],
      onSome: (path) =>
        Option.match(scoped(scope, path), {
          onSome: Array.of,
          onNone: () => ending(scope.catalogue, path),
        }),
    });
