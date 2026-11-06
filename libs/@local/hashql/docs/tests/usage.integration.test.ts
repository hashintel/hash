import { Array, HashMap, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Usage from "../src/Usage.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";

interface Users {
  readonly accepted: readonly string[];
  readonly returned: readonly string[];
}

interface Collected {
  readonly index: Usage.Index;
  readonly users: (name: string) => Users;
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

const collect = async (source: string): Promise<Collected> => {
  const reference = await Reference.success({
    source,
    files: { "hidden.d.ts": "export interface Hidden {}" },
  });
  const index = Usage.collect(reference.document.catalogue);
  const labels = labelsOf(reference);
  const label = (target: AST.Reference.Reference.Target): string =>
    pipe(
      Option.liftPredicate(target, (value) => value._tag === "Local"),
      Option.flatMap(({ node }) => HashMap.get(labels, node)),
      Option.getOrThrow,
    );

  return {
    index,
    users: (name) => {
      const usage = Usage.of(index, Reference.id(reference, [name]));

      return {
        accepted: Array.map(usage.acceptedBy, label),
        returned: Array.map(usage.returnedBy, label),
      };
    },
  };
};

describe("usage", () => {
  test("roles_and_aliases", async () => {
    expect.hasAssertions();
    const { users } = await collect(`
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
  });

  test("members_and_shadowing", async () => {
    expect.hasAssertions();
    const { users } = await collect(`
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
  });

  test("private_and_self", async () => {
    expect.hasAssertions();
    const { users, index } = await collect(`
      import type { Hidden } from "./hidden.js";
      export declare function run(value: Hidden): typeof run;
      export interface Public {}
    `);
    expect(users("run")).toStrictEqual({ accepted: [], returned: [] });
    expect([
      HashMap.size(index.acceptedBy),
      HashMap.size(index.returnedBy),
    ]).toStrictEqual([0, 0]);
  });

  test("type_only_members", async () => {
    expect.hasAssertions();
    const { users } = await collect(`
      export interface A {}
      declare class Container { static hidden(value: A): A; kept(value: A): A; }
      export type { Container };
    `);
    expect(users("A")).toStrictEqual({
      accepted: ["kept"],
      returned: ["kept"],
    });
  });
});
