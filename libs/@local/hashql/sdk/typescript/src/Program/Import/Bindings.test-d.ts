/**
 * Static checks for what an import's bindings establish once code guards a flattened name.
 *
 * @module
 */
import { Function, Result } from "effect";
import { assert, describe, expectTypeOf, test } from "vitest";

import * as Program from "../index.js";
import * as Bindings from "./Bindings.js";

import type * as Type from "../../Type.js";

const { Expression, Import, Module, Namespace, Prelude, Structural } = Program;
const identity = Symbol("Item");
type Item = Type.Opaque<typeof identity, Type.PrimitiveInteger>;
const input = Expression.input(
  "count",
  Result.getOrThrow(Structural.type(BigInt)),
);
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Item: Prelude.builtin.modules.math },
    types: { Item: Module.type<Item>() },
    values: {
      Item: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Item>
      >(),
      other: Module.value<Type.PrimitiveString>(),
    },
  }),
);
type Source = typeof source;
const separate = Result.getOrThrow(
  Module.define("::separate", {
    types: { Kind: Module.type<Item>() },
    values: {
      create:
        Module.value<Type.Function<readonly [Type.PrimitiveInteger], Item>>(),
    },
  }),
);
const genericSource = Result.getOrThrow(
  Module.define("::generic", {
    types: { Generic: Prelude.builtin.types.List },
    values: { Generic: Prelude.builtin.modules.cmp.values.eq },
  }),
);
const joined = Namespace.flatten(
  Result.getOrThrow(Import.bind(source, "*")).scope,
).Item;
const independentJoined = Namespace.combine(
  source.values.Item,
  source.types.Item,
);
type Entry<
  S extends Required<Program.Scope.Definition.Any>,
  N extends keyof Program.Scope.Definition.Any,
  K extends PropertyKey,
> = Bindings.Bindings.Entry<S, N, K>;

describe("bindings", () => {
  describe("make", () => {
    test("selected_exports_required", () => {
      expectTypeOf(
        Bindings.make<Source, "*">({
          modules: source.modules,
          types: source.types,
          values: source.values,
        }),
      ).toEqualTypeOf<Bindings.Bindings<Source, "*">>();
      Bindings.make<Source, "*">({
        modules: source.modules,
        types: source.types,
        // @ts-expect-error A bindings table holds every export its selection guarantees.
        values: { Item: source.values.Item },
      });
    });
  });

  describe("entry", () => {
    test("guarded_name", () => {
      type Listed = Bindings.Bindings<Source, readonly ("Item" | "other")[]>;
      expectTypeOf<Listed["types"]["Item"]>().toEqualTypeOf<
        Source["types"]["Item"] | undefined
      >();
      expectTypeOf<Entry<Listed, "modules", "Item">>().toEqualTypeOf<
        Source["modules"]["Item"]
      >();
      expectTypeOf<Entry<Listed, "types", "Item">>().toEqualTypeOf<
        Source["types"]["Item"]
      >();
      expectTypeOf<Entry<Listed, "values", "Item">>().toEqualTypeOf<
        Source["values"]["Item"]
      >();
      expectTypeOf<Entry<Listed, "values", "other">>().toEqualTypeOf<
        Source["values"]["other"]
      >();
      expectTypeOf<
        Entry<Listed, "types", "other">
      >().toEqualTypeOf<undefined>();
    });

    test("one_source_aliases", () => {
      type Aliased = Bindings.Bindings<
        Source,
        { readonly Item?: "_" | "local" }
      >;
      expectTypeOf<Aliased["values"]["local"]>().toEqualTypeOf<
        Source["values"]["Item"] | undefined
      >();
      expectTypeOf<Entry<Aliased, "types", "Item">>().toEqualTypeOf<
        Source["types"]["Item"]
      >();
      expectTypeOf<Entry<Aliased, "types", "local">>().toEqualTypeOf<
        Source["types"]["Item"]
      >();
      expectTypeOf<Entry<Aliased, "values", "local">>().toEqualTypeOf<
        Source["values"]["Item"]
      >();
    });

    test("shared_alias", () => {
      type Shared = Bindings.Bindings<
        Source,
        { readonly Item: "local" } | { readonly other: "local" }
      >;
      expectTypeOf<Entry<Shared, "types", "local">>().toEqualTypeOf<
        Source["types"]["Item"] | undefined
      >();
      expectTypeOf<Entry<Shared, "modules", "local">>().toEqualTypeOf<
        Source["modules"]["Item"] | undefined
      >();
    });

    test("optional_source_export", () => {
      type Optional = Program.Module.Module<{
        readonly types: Source["types"];
        readonly values: { readonly Item?: Source["values"]["Item"] };
      }>;
      type Listed = Bindings.Bindings<Optional, readonly "Item"[]>;
      expectTypeOf<Entry<Listed, "types", "Item">>().toEqualTypeOf<
        Source["types"]["Item"]
      >();
      expectTypeOf<Entry<Listed, "values", "Item">>().toEqualTypeOf<
        Source["values"]["Item"] | undefined
      >();
    });

    test("ordinary_scope", () => {
      interface Scope {
        readonly modules: { readonly Item?: Source["modules"]["Item"] };
        readonly types: { readonly Item?: Source["types"]["Item"] };
        readonly values: { readonly Item?: Source["values"]["Item"] };
      }
      expectTypeOf<Scope>().not.toExtend<
        Bindings.Bindings<Source, readonly "Item"[]>
      >();
      expectTypeOf<Entry<Scope, "types", "Item">>().toEqualTypeOf<
        Source["types"]["Item"] | undefined
      >();
      expectTypeOf<Entry<Scope, "values", "Item">>().toEqualTypeOf<
        Source["values"]["Item"] | undefined
      >();
      const { Item: item } = Namespace.flatten({
        modules: {},
        types: { Item: source.types.Item },
        values: {},
      });
      expectTypeOf(item).not.toExtend<typeof joined>();
    });
  });

  describe("flatten", () => {
    test("correlated_capabilities", () => {
      const { Item: item } = Namespace.flatten(
        Result.getOrThrow(
          Import.bind(source, Function.identity<readonly "Item"[]>(["Item"])),
        ).scope,
      );
      expectTypeOf(item).toEqualTypeOf<typeof joined | undefined>();
      assert.isDefined(item);
      expectTypeOf(item(1n)).toEqualTypeOf<
        Program.Expression.Expression<Item, Program.Inputs.Empty>
      >();
      expectTypeOf(item(input)).toEqualTypeOf<
        Program.Expression.Expression<
          Item,
          { readonly count: Type.PrimitiveInteger }
        >
      >();
      expectTypeOf(item.add(1n, 2n)).toEqualTypeOf<
        Program.Expression.Expression<
          Type.PrimitiveInteger,
          Program.Inputs.Empty
        >
      >();
      expectTypeOf(Result.getOrThrow(Structural.type(item))).toEqualTypeOf<
        Program.TypeExpression.TypeExpression<Item>
      >();
    });

    test("correlated_aliases", () => {
      const flat = Namespace.flatten(
        Result.getOrThrow(
          Import.bind(
            source,
            Function.identity<{ readonly Item?: "_" | "local" }>({}),
          ),
        ).scope,
      );
      expectTypeOf(flat.Item).toEqualTypeOf<typeof joined | undefined>();
      expectTypeOf(flat.local).toEqualTypeOf<typeof joined | undefined>();
      assert.isDefined(flat.local);
      expectTypeOf(flat.local(1n)).toEqualTypeOf<
        Program.Expression.Expression<Item, Program.Inputs.Empty>
      >();
      expectTypeOf(
        Result.getOrThrow(Structural.type(flat.local)),
      ).toEqualTypeOf<Program.TypeExpression.TypeExpression<Item>>();
    });

    test("generic_correlation", () => {
      const { Generic: generic } = Namespace.flatten(
        Result.getOrThrow(
          Import.bind(
            genericSource,
            Function.identity<readonly "Generic"[]>(["Generic"]),
          ),
        ).scope,
      );
      assert.isDefined(generic);
      expectTypeOf(generic(String)).toEqualTypeOf<
        Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
      >();
      expectTypeOf(generic(1n, "text")).toEqualTypeOf<
        Program.Expression.Expression<
          Type.PrimitiveBoolean,
          Program.Inputs.Empty
        >
      >();
    });

    test("different_sources", () => {
      const { local } = Namespace.flatten(
        Result.getOrThrow(
          Import.bind(
            separate,
            Function.identity<{ Kind: "local" } | { create: "local" }>({
              Kind: "local",
            }),
          ),
        ).scope,
      );
      assert.isDefined(local);
      // @ts-expect-error A shared alias does not establish a value capability.
      expectTypeOf(local).toExtend<typeof separate.values.create>();
      // @ts-expect-error A shared alias does not establish a type capability.
      expectTypeOf(local).toExtend<typeof separate.types.Kind>();
    });

    test("independent_optional_exports", () => {
      const scope = Function.identity<{
        readonly types: { readonly Item?: typeof source.types.Item };
        readonly values: { readonly Item?: typeof source.values.Item };
      }>({ types: {}, values: {} });
      const { Item: item } = Namespace.flatten({ modules: {}, ...scope });
      assert.isDefined(item);
      // @ts-expect-error Ordinary scopes do not promise that optional capabilities arrive together.
      expectTypeOf(item).toExtend<typeof independentJoined>();
      const optional = Result.getOrThrow(Module.define("::optional", scope));
      const { Item: selected } = Namespace.flatten(
        Result.getOrThrow(Import.bind(optional, ["Item"])).scope,
      );
      assert.isDefined(selected);
      // @ts-expect-error Selecting a source does not make its optional exports required.
      expectTypeOf(selected).toExtend<typeof independentJoined>();
    });
  });
});
