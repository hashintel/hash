import { Array, Function, HashMap, MutableHashMap, Option, pipe } from "effect";

import * as AST from "./AST/index.js";
import * as ExternalTarget from "./ExternalTarget.js";
import * as AppliedTypes from "./internal/applied-types.js";
import * as Parts from "./internal/parts.js";
import * as References from "./internal/references.js";
import * as Node from "./TypeScript/Node.js";

import type * as Catalogue from "./Catalogue.js";
import type * as Tree from "./Tree/index.js";

/** A public declaration or member whose calls mention another declaration. */
type User = AST.Interned.Interned<AST.Target.Local>;

/** Public functions, methods and accessors that mention a declaration in each part of their calls. */
export interface Usage {
  readonly returnedBy: readonly User[];
  readonly acceptedBy: readonly User[];
}

/** A user of a declaration, with the meaning its mention reads the declaration's name with: the value after `typeof`, and the type anywhere else. */
interface Use {
  readonly user: User;
  readonly meaning: Tree.Export.Meaning;
}

/** A use names the declaration, so exported aliases share the same users. */
export interface Index {
  readonly returnedBy: HashMap.HashMap<Catalogue.DeclarationId, readonly Use[]>;
  readonly acceptedBy: HashMap.HashMap<Catalogue.DeclarationId, readonly Use[]>;
}

interface Note extends Use {
  readonly id: Catalogue.DeclarationId;
  readonly role: keyof Usage;
}

/** The uses of each declaration in `role`, without repeats, in the order the notes name them. */
const usesOf = (
  notes: readonly Note[],
  role: keyof Usage,
): Index["returnedBy"] => {
  const uses = MutableHashMap.empty<Catalogue.DeclarationId, Use[]>();

  for (const { id, role: noted, user, meaning } of notes) {
    if (noted === role) {
      const known = MutableHashMap.get(uses, id);

      if (Option.isNone(known)) {
        MutableHashMap.set(uses, id, [{ user, meaning }]);
      } else if (
        !known.value.some((use) => use.user === user && use.meaning === meaning)
      ) {
        known.value.push({ user, meaning });
      }
    }
  }

  return HashMap.fromIterable(uses);
};

/** What states the parameters and the result of each call a part makes: the part's own declaration where that is the call, or the calls it numbers. */
const signaturesOf = ({
  source,
  calls,
}: Parts.Part): readonly AST.Signature.Signature[] =>
  Option.match(Parts.called(source), {
    onSome: (call): readonly AST.Signature.Signature[] => [call],
    onNone: () => calls,
  });

/** Reads the references in every public call's parameters, type parameters and result, including type-parameter constraints and defaults. */
export const collect = (catalogue: Catalogue.Catalogue): Index => {
  const { ast } = catalogue;
  const names = References.namesOf(ast);
  const read = AppliedTypes.of({ ast, names });
  const mentioned = (
    nodes: readonly Node.Node[],
  ): readonly Pick<Note, "id" | "meaning">[] =>
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
          Option.map((id) => ({
            id,
            meaning:
              ExternalTarget.meaning(node) === "value"
                ? ("value" as const)
                : ("type" as const),
          })),
          Option.toArray,
        ),
      ),
    );

  const notes = Array.flatMap(catalogue.entries, (entry) => {
    const parts = Parts.of(ast, entry);
    const apart = Parts.documented(ast, entry)._tag === "Apart";
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
          // A callable constant or property reads its calls' types as its annotation applies them, which is how its page states them.
          const returns = pipe(
            call.returns,
            Option.map((id) => read(part, id)),
            Option.toArray,
          );
          const accepts = pipe(
            Array.fromIterable(call.typeParameters),
            Array.flatMap((id) => {
              const { constraint, default: fallback } = ast.get(id);

              return Array.getSomes([constraint, fallback]);
            }),
            Array.appendAll(
              Array.flatMap(Array.fromIterable(call.parameters), (id) =>
                Option.toArray(ast.get(id).type),
              ),
            ),
            Array.map((type) => read(part, type)),
          );

          return pipe(
            Array.appendAll(
              Array.map(mentioned(returns), (mention): Note => ({
                ...mention,
                role: "returnedBy",
                user,
              })),
              Array.map(mentioned(accepts), (mention): Note => ({
                ...mention,
                role: "acceptedBy",
                user,
              })),
            ),
            // A declaration whose own calls name it does not use itself, as a function that returns `typeof` itself. A value declared apart from its type does use that type.
            Array.filter(
              ({ id, meaning }) => user !== id || (apart && meaning === "type"),
            ),
          );
        }),
      ),
    );
  });

  return {
    returnedBy: usesOf(notes, "returnedBy"),
    acceptedBy: usesOf(notes, "acceptedBy"),
  };
};

type Exported = Pick<Tree.Export.Own, "origin" | "meaning">;

const usersOf = (
  uses: Index["returnedBy"],
  { origin, meaning }: Exported,
): readonly User[] =>
  pipe(
    HashMap.get(uses, origin.id),
    Option.getOrElse((): readonly Use[] => []),
    Array.filter((use) =>
      Option.match(meaning, {
        onNone: () => true,
        onSome: (own) => use.meaning === own,
      }),
    ),
    Array.map(({ user }) => user),
    Array.dedupe,
  );

/** Both roles of an export, each empty when nothing uses it that way. An export that documents one meaning of its name has the users whose mention reads that meaning. */
export const of: {
  (exported: Exported): (index: Index) => Usage;
  (index: Index, exported: Exported): Usage;
} = Function.dual(2, (index: Index, exported: Exported): Usage => ({
  returnedBy: usersOf(index.returnedBy, exported),
  acceptedBy: usersOf(index.acceptedBy, exported),
}));
