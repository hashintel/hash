import { Array, Function, HashMap, MutableHashMap, Option, pipe } from "effect";

import * as AST from "./AST/index.js";
import * as Parts from "./internal/parts.js";
import * as References from "./internal/references.js";
import * as Node from "./TypeScript/Node.js";

import type * as Catalogue from "./Catalogue.js";

/** A public declaration or member whose calls mention another declaration. */
type User = AST.Interned.Interned<AST.Target.Local>;

/** Public functions, methods and accessors that mention a declaration in each part of their calls. */
export interface Usage {
  readonly returnedBy: readonly User[];
  readonly acceptedBy: readonly User[];
}

/** A use names the declaration, so exported aliases share the same users. */
export interface Index {
  readonly returnedBy: HashMap.HashMap<
    Catalogue.DeclarationId,
    readonly User[]
  >;
  readonly acceptedBy: HashMap.HashMap<
    Catalogue.DeclarationId,
    readonly User[]
  >;
}

interface Note {
  readonly id: Catalogue.DeclarationId;
  readonly role: keyof Usage;
  readonly user: User;
}

/** Each declaration's users in `role`, each once, in the order the notes name them. */
const usersOf = (
  notes: readonly Note[],
  role: keyof Usage,
): Index["returnedBy"] => {
  const users = MutableHashMap.empty<Catalogue.DeclarationId, User[]>();

  for (const { id, role: noted, user } of notes) {
    if (noted === role) {
      const known = MutableHashMap.get(users, id);

      if (Option.isNone(known)) {
        MutableHashMap.set(users, id, [user]);
      } else if (!known.value.includes(user)) {
        known.value.push(user);
      }
    }
  }

  return HashMap.fromIterable(users);
};

/** What states the parameters and the result of each call a part makes. Reading a member calls its getter, and writing it calls its setter. */
const signaturesOf = ({
  source,
  calls,
}: Parts.Part): readonly AST.Signature.Signature[] =>
  source._tag === "Getter" || source._tag === "Setter" ? [source] : calls;

/** Reads the references in every public call's parameters, type parameters and result, including type-parameter constraints and defaults. */
export const collect = (catalogue: Catalogue.Catalogue): Index => {
  const { ast } = catalogue;
  const names = References.namesOf(ast);
  const mentioned = (
    nodes: readonly Node.Node[],
  ): readonly Catalogue.DeclarationId[] =>
    pipe(
      nodes,
      Array.flatMap(Node.identifiers),
      Array.flatMap((node) =>
        names(node).pipe(
          Option.flatMap((target) =>
            ast
              .narrow(target, AST.Declaration.isDeclaration)
              .pipe(Option.filter((id) => HashMap.has(catalogue.byId, id))),
          ),
          Option.toArray,
        ),
      ),
      Array.dedupe,
    );

  const notes = Array.flatMap(catalogue.entries, (entry) => {
    const parts = Parts.of(ast, entry);
    const callers = Array.prepend(
      Array.map(Parts.members(parts, { ast, entry }), (member) => ({
        user: member.id,
        parts: member.parts,
      })),
      { user: entry.id, parts },
    );

    return Array.flatMap(callers, ({ user, parts: own }) =>
      Array.flatMap(own, (part) =>
        Array.flatMap(signaturesOf(part), (call) => {
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
            Array.filter(({ id }) => user !== id),
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
