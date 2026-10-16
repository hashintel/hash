import { describe, expectTypeOf, test } from "vitest";

import type * as Type from "./index.js";

type User = Type.Struct<{
  readonly id: Type.Opaque<"UserId", Type.PrimitiveInteger>;
  readonly names: Type.List<Type.PrimitiveString>;
}>;

interface Recursive extends Type.Struct<{
  readonly children: Type.List<Recursive>;
}> {}

const preserve = <T extends Type.Any>(value: T): T => value;
const inspect = (value: User): User => preserve(value);

const children = (type: Type.All): readonly Type.All[] => {
  switch (type._tag) {
    case "Union":
    case "Intersection": {
      return type.types;
    }
    case "Opaque": {
      return [type.type];
    }
    case "Struct": {
      return Object.values(type.fields);
    }
    case "Tuple": {
      return type.fields;
    }
    case "Dict": {
      return [type.key, type.value];
    }
    case "List": {
      return [type.element];
    }
    case "Function": {
      return [...type.parameters, type.returns];
    }
    case "GenericFunction":
    case "Integer":
    case "Number":
    case "String":
    case "Boolean":
    case "Null":
    case "Never":
    case "Unknown": {
      return [];
    }
    default: {
      expectTypeOf(type).toBeNever();
      return [];
    }
  }
};

describe("composite_types", () => {
  test("generic_arguments", () => {
    expectTypeOf<User["fields"]["id"]["name"]>().toEqualTypeOf<"UserId">();
    expectTypeOf<
      User["fields"]["names"]["element"]
    >().toEqualTypeOf<Type.PrimitiveString>();
    expectTypeOf<
      Type.Dict<Type.PrimitiveString, User>["value"]
    >().toEqualTypeOf<User>();
  });

  test("erased_constraint", () => {
    expectTypeOf(inspect).returns.toEqualTypeOf<User>();
    expectTypeOf<Type.All>().toExtend<Type.Any>();
    expectTypeOf<Type.Any>().not.toExtend<Type.All>();
    expectTypeOf<Type.List<Type.Any>>().not.toExtend<Type.All>();
  });

  test("inspectable_forms", () => {
    expectTypeOf<User>().toExtend<Type.Struct.Any>();
    expectTypeOf<User>().toExtend<Type.Struct.All>();
    expectTypeOf<
      Type.Union<readonly [User, Type.PrimitiveNull]>
    >().toExtend<Type.Union.All>();
    expectTypeOf<
      Type.Intersection<
        readonly [User, Type.Struct<{ readonly age: Type.PrimitiveInteger }>]
      >
    >().toExtend<Type.Intersection.All>();
    expectTypeOf<
      Type.Opaque<"UserId", Type.PrimitiveInteger>
    >().toExtend<Type.Opaque.All>();
    expectTypeOf<
      Type.Dict<Type.PrimitiveString, User>
    >().toExtend<Type.Dict.All>();
    expectTypeOf<Type.List<User>>().toExtend<Type.List.All>();
  });

  test("recursive_record", () => {
    expectTypeOf<Recursive>().toExtend<Type.All>();
    expectTypeOf<
      Recursive["fields"]["children"]["element"]
    >().toEqualTypeOf<Recursive>();
  });
});

describe("tuple_types", () => {
  test("tuple_fixed", () => {
    expectTypeOf<Type.Tuple<readonly []>["fields"]>().toEqualTypeOf<
      readonly []
    >();
    expectTypeOf<
      Type.Tuple<
        readonly [Type.PrimitiveString, Type.PrimitiveInteger]
      >["fields"]
    >().toEqualTypeOf<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>();
    expectTypeOf<Type.Tuple<[Type.PrimitiveString]>["fields"]>().toEqualTypeOf<
      [Type.PrimitiveString]
    >();
    expectTypeOf<Type.Tuple<readonly [User]>>().toExtend<Type.Tuple.All>();
    expectTypeOf<Type.Tuple.All>().toExtend<Type.Tuple.Any>();
  });

  test("tuple_unbounded", () => {
    expectTypeOf<
      // @ts-expect-error An array has no fixed arity.
      Type.Tuple<readonly Type.PrimitiveInteger[]>
    >();
    expectTypeOf<
      // @ts-expect-error A rest element has unbounded arity.
      Type.Tuple<readonly [Type.PrimitiveInteger, ...Type.PrimitiveString[]]>
    >();
    expectTypeOf<
      // @ts-expect-error A union containing an array has no fixed arity.
      Type.Tuple<readonly [] | readonly Type.PrimitiveInteger[]>
    >();
  });

  test("tuple_optional", () => {
    expectTypeOf<
      // @ts-expect-error Tuple elements must be present.
      Type.Tuple<readonly [Type.PrimitiveInteger?]>
    >();
    expectTypeOf<
      // @ts-expect-error A trailing optional element is not fixed-arity.
      Type.Tuple<readonly [Type.PrimitiveInteger, Type.PrimitiveString?]>
    >();
  });
});

describe("type_boundaries", () => {
  test("raw_argument_rejection", () => {
    expectTypeOf<
      // @ts-expect-error Tuple fields are descriptors, not JavaScript value types.
      Type.Tuple<readonly [number]>
    >();
    expectTypeOf<
      // @ts-expect-error Struct fields must be descriptors.
      Type.Struct<{ readonly age: number }>
    >();
    expectTypeOf<
      // @ts-expect-error Dictionary keys must be descriptors.
      Type.Dict<string, Type.PrimitiveInteger>
    >();
    expectTypeOf<
      // @ts-expect-error The discriminant must name a supported type.
      Type.List<{ readonly _tag: "Bogus" }>
    >();
  });

  test("primitive_payloads", () => {
    expectTypeOf<Type.PrimitiveInteger["value"]>().toEqualTypeOf<bigint>();
    expectTypeOf<Type.PrimitiveNumber["value"]>().toEqualTypeOf<number>();
    expectTypeOf<Type.PrimitiveString["value"]>().toEqualTypeOf<string>();
    expectTypeOf<Type.PrimitiveBoolean["value"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Type.PrimitiveNull["value"]>().toBeNull();
    expectTypeOf<Type.Never["value"]>().toBeNever();
    expectTypeOf<Type.Unknown["value"]>().toBeUnknown();
  });

  test("opaque_names", () => {
    expectTypeOf<Type.Opaque<"UserId", Type.PrimitiveInteger>>().not.toExtend<
      Type.Opaque<"PostId", Type.PrimitiveInteger>
    >();
  });

  test("discriminant_narrowing", () => {
    expectTypeOf(children).returns.toEqualTypeOf<readonly Type.All[]>();
  });
});
