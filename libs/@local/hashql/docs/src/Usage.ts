import { Array, Function, HashMap, MutableHashMap, Option, pipe } from "effect";

import * as AST from "./AST/index.js";
import * as Parts from "./internal/parts.js";
import * as Node from "./TypeScript/Node.js";

import type * as Catalogue from "./Catalogue.js";

type Target = AST.Reference.Reference.Target;

/** Public functions and methods that mention a declaration in each part of their calls. */
export interface Usage {
  readonly returnedBy: readonly Target[];
  readonly acceptedBy: readonly Target[];
}

/** A use names the declaration, so exported aliases share the same users. */
export interface Index {
  readonly returnedBy: HashMap.HashMap<
    Catalogue.DeclarationId,
    readonly Target[]
  >;
  readonly acceptedBy: HashMap.HashMap<
    Catalogue.DeclarationId,
    readonly Target[]
  >;
}

interface Note {
  readonly id: Catalogue.DeclarationId;
  readonly role: keyof Usage;
  readonly user: Extract<Target, { readonly _tag: "Local" }>;
}

/** Each declaration's users in `role`, each once, in the order the notes name them. */
const usersOf = (
  notes: readonly Note[],
  role: keyof Usage,
): Index["returnedBy"] => {
  const users = MutableHashMap.empty<Catalogue.DeclarationId, Target[]>();

  for (const { id, role: noted, user } of notes) {
    if (noted === role) {
      const known = MutableHashMap.get(users, id);

      if (Option.isNone(known)) {
        MutableHashMap.set(users, id, [user]);
      } else if (!Array.some(known.value, AST.Reference.sameTarget(user))) {
        known.value.push(user);
      }
    }
  }

  return HashMap.fromIterable(users);
};

/** Reads the references in every public call's parameters, type parameters and result, including type-parameter constraints and defaults. */
export const collect = (catalogue: Catalogue.Catalogue): Index => {
  const { ast } = catalogue;
  const mentioned = (
    nodes: readonly Node.Node[],
  ): readonly Catalogue.DeclarationId[] =>
    pipe(
      nodes,
      Array.flatMap(Node.identifiers),
      Array.flatMap((node) =>
        ast.referenceAt(node).pipe(
          Option.flatMap(({ target }) => {
            if (target._tag !== "Local") {
              return Option.none();
            }

            return ast
              .narrow(target.node, AST.Declaration.isDeclaration)
              .pipe(Option.filter((id) => HashMap.has(catalogue.byId, id)));
          }),
          Option.toArray,
        ),
      ),
      Array.dedupe,
    );

  const notes = Array.flatMap(catalogue.entries, (entry) => {
    const parts = Parts.of(ast, entry);
    const callers = Array.prepend(
      Array.map(Parts.members(parts, { ast, entry }), (member) => ({
        user: { _tag: "Local", node: member.id } as const,
        parts: member.parts,
      })),
      { user: { _tag: "Local", node: entry.id } as const, parts },
    );

    return Array.flatMap(callers, ({ user, parts: own }) =>
      Array.flatMap(own, ({ calls }) =>
        Array.flatMap(calls, (call) => {
          const returns = pipe(
            call.returns,
            Option.map((id) => ast.get(id).node),
            Option.toArray,
          );
          const accepts = Array.appendAll(
            Array.map(
              Array.fromIterable(call.typeParameters),
              (id) => ast.get(id).node,
            ),
            Array.map(
              Array.fromIterable(call.parameters),
              (id) => ast.get(id).node,
            ),
          );

          return pipe(
            Array.appendAll(
              Array.map(mentioned(returns), (id): Note => ({
                id,
                role: "returnedBy",
                user,
              })),
              Array.map(mentioned(accepts), (id): Note => ({
                id,
                role: "acceptedBy",
                user,
              })),
            ),
            // A function merged with the type it returns names its own declaration, which is not a use of it.
            Array.filter(({ id }) => user.node !== id),
          );
        }),
      ),
    );
  });

  return {
    returnedBy: usersOf(notes, "returnedBy"),
    acceptedBy: usersOf(notes, "acceptedBy"),
  };
};

/** Both roles of a declaration, each empty when nothing uses it that way. */
export const of: {
  (id: Catalogue.DeclarationId): (index: Index) => Usage;
  (index: Index, id: Catalogue.DeclarationId): Usage;
} = Function.dual(2, (index: Index, id: Catalogue.DeclarationId): Usage => ({
  returnedBy: HashMap.get(index.returnedBy, id).pipe(
    Option.getOrElse(() => []),
  ),
  acceptedBy: HashMap.get(index.acceptedBy, id).pipe(
    Option.getOrElse(() => []),
  ),
}));
