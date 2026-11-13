import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, HashMap, Option } from "effect";

import * as Usage from "../src/Usage.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";
import type * as Document from "../src/Document.js";

interface Users {
  readonly accepted: readonly string[];
  readonly returned: readonly string[];
}

interface Collected {
  readonly index: Usage.Index;
  readonly users: (name: string) => Users;
  /** The users of the value `name`, whose type is declared apart from it. */
  readonly valueUsers: (name: string) => Users;
}

/** What a reader calls a user: an export's path, or a member's name with `static` before a static one's. */
const labelsOf = ({
  document,
}: Reference.Reference): HashMap.HashMap<AST.Node.Interned, string> =>
  HashMap.fromIterable(
    Array.flatMap(
      Array.fromIterable(document.entries),
      ([id, own]): readonly (readonly [AST.Node.Interned, string])[] =>
        Array.prepend(
          Array.map(
            own.members,
            ({
              id: member,
              name,
              static: isStatic,
            }): readonly [AST.Node.Interned, string] => [
              member,
              `${isStatic ? "static " : ""}${name}`,
            ],
          ),
          [id, own.origin.name.path.join(".")],
        ),
    ),
  );

const collect = Effect.fnUntraced(function* (
  source: string,
): Effect.fn.Return<Collected, Reference.Failure> {
  const reference = yield* Reference.success({
    source,
    files: { "hidden.d.ts": "export interface Hidden {}" },
  });
  const index = Usage.collect(reference.document.catalogue);
  const labels = labelsOf(reference);
  const label = (target: AST.Node.Interned): string =>
    HashMap.get(labels, target).pipe(Option.getOrThrow);

  const usersIn =
    (exports: Document.Document["entries"]) =>
    (name: string): Users => {
      const usage = Usage.of(
        index,
        HashMap.get(exports, Reference.id(reference, [name])).pipe(
          Option.getOrThrow,
        ),
      );

      return {
        accepted: Array.map(usage.acceptedBy, label),
        returned: Array.map(usage.returnedBy, label),
      };
    };

  return {
    index,
    users: usersIn(reference.document.entries),
    valueUsers: usersIn(reference.document.values),
  };
});

describe("usage", () => {
  it.effect(
    "roles_and_aliases",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users } = yield* collect(`
      export interface A {} export interface B {} export interface C {} export interface D extends A {} export interface E {}
      export declare function run<T extends A = D>(value: B): C;
      export declare function run(value: B): C;
      export { run as alias };
      export declare const call: (value: A) => B;
    `);
      expect(Array.map(["A", "B", "C", "D", "E"], users)).toStrictEqual([
        { accepted: ["run", "call"], returned: [] },
        { accepted: ["run"], returned: ["call"] },
        { accepted: [], returned: ["run"] },
        { accepted: ["run"], returned: [] },
        { accepted: [], returned: [] },
      ]);
    }),
  );

  it.effect(
    "members_and_shadowing",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users } = yield* collect(`
      export interface A {}
      export declare class Container {
        static use(value: A): A;
        use<A>(value: A): A;
        other(value: A): A;
      }
    `);
      expect(users("A")).toStrictEqual({
        accepted: ["static use", "other"],
        returned: ["static use", "other"],
      });
    }),
  );

  it.effect(
    "accessors",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users } = yield* collect(`
      export interface A {} export interface B {} export interface C {}
      export declare class Box {
        get current(): A;
        set current(value: B);
        static get shared(): A;
        readonly plain: C;
      }
    `);
      expect(Array.map(["A", "B", "C"], users)).toStrictEqual([
        { accepted: [], returned: ["current", "static shared"] },
        { accepted: ["current"], returned: [] },
        { accepted: [], returned: [] },
      ]);
    }),
  );

  it.effect(
    "callable_properties",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users } = yield* collect(`
      export interface A {} export interface B {} export interface C {}
      export type Step<S> = (value: S) => C;
      export interface Context {
        readonly run: (value: A) => B;
        readonly pick: { (value: A): A; (value: B): B };
        readonly step: Step<A>;
        readonly plain: C;
      }
    `);
      expect(Array.map(["A", "B", "C"], users)).toStrictEqual([
        // `step` takes its call from `Step<S>`, where `S` is `A`.
        { accepted: ["run", "pick", "step"], returned: ["pick"] },
        { accepted: ["pick"], returned: ["run", "pick"] },
        { accepted: [], returned: ["step"] },
      ]);
    }),
  );

  it.effect(
    "private_and_self",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users, index } = yield* collect(`
      import type { Hidden } from "./hidden.js";
      export declare function run(value: Hidden): typeof run;
      export interface Public {}
    `);
      expect(users("run")).toStrictEqual({ accepted: [], returned: [] });
      expect([
        HashMap.size(index.acceptedBy),
        HashMap.size(index.returnedBy),
      ]).toStrictEqual([0, 0]);
    }),
  );

  it.effect(
    "type_and_value_apart",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users, valueUsers } = yield* collect(`
      export interface A {}
      export declare const A: number;
      export declare function read(value: typeof A): A;
      export declare function both(value: A | typeof A): void;
    `);
      expect([users("A"), valueUsers("A")]).toStrictEqual([
        { accepted: ["both"], returned: ["read"] },
        { accepted: ["read", "both"], returned: [] },
      ]);
    }),
  );

  it.effect(
    "type_only_members",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { users } = yield* collect(`
      export interface A {}
      declare class Container { static hidden(value: A): A; kept(value: A): A; }
      export type { Container };
    `);
      expect(users("A")).toStrictEqual({
        accepted: ["kept"],
        returned: ["kept"],
      });
    }),
  );
});
