import * as S from "@effect/schema/Schema";
import { Either } from "effect";
import { describe, expect, test } from "vitest";

import * as DataType from "../../src/ontology/DataType.js";
import * as DataTypeUrl from "../../src/ontology/DataTypeUrl.js";
import * as Json from "../../src/Json.js";

describe("literal", () => {
  test("`number`", () => {
    const numberLiteral = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number-123/v/1"),
      S.literal(123).pipe(S.title("A constant number of value `123`")),
    );

    const dataType = Either.getOrThrow(numberLiteral);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number-123/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": 123,
          "kind": "dataType",
          "title": "A constant number of value \`123\`",
          "type": "number",
        }
      `);
  });

  test("`string`", () => {
    const stringLiteral = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/string-abc/v/1"),
      S.literal("abc").pipe(S.title("A constant string of value `abc`")),
    );

    const dataType = Either.getOrThrow(stringLiteral);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string-abc/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": "abc",
          "kind": "dataType",
          "title": "A constant string of value \`abc\`",
          "type": "string",
        }
      `);
  });

  test("`boolean`", () => {
    const booleanLiteral = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/boolean-true/v/1"),
      S.literal(true).pipe(S.title("A constant boolean of value `true`")),
    );

    const dataType = Either.getOrThrow(booleanLiteral);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/boolean-true/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": true,
          "kind": "dataType",
          "title": "A constant boolean of value \`true\`",
          "type": "boolean",
        }
      `);
  });

  test("`null`", () => {
    const nullLiteral = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/null/v/1"),
      S.literal(null).pipe(S.title("A constant null value")),
    );

    const dataType = Either.getOrThrow(nullLiteral);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/null/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "kind": "dataType",
          "title": "A constant null value",
          "type": "null",
        }
      `);
  });

  test("`bigint`", () => {
    const bigIntLiteral = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/bigint/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.literal(123n).pipe(S.title("A constant bigint of value `123n`")),
    );

    const error = Either.flip(bigIntLiteral).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedLiteral",
          "literal": "bigint",
        }
      `);
  });
});

describe("keywords", () => {
  test("`undefined`", () => {
    const undefinedType = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/undefined/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.undefined.pipe(S.title("A constant undefined value")),
    );

    const error = Either.flip(undefinedType).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "UnsupportedKeyword",
        "keyword": "undefined",
      }
    `);
  });

  test("`void`", () => {
    const voidType = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/void/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.void.pipe(S.title("A constant void value")),
    );

    const error = Either.flip(voidType).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedKeyword",
          "keyword": "void",
        }
      `);
  });

  test("`never`", () => {
    const neverType = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/never/v/1"),
      S.never.pipe(S.title("A constant never value")),
    );

    const error = Either.flip(neverType).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "UnsupportedKeyword",
        "keyword": "never",
      }
    `);
  });

  test("`unknown`", () => {
    const unknownType = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/unknown/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.unknown.pipe(S.title("A constant unknown value")),
    );

    const error = Either.flip(unknownType).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "UnsupportedKeyword",
        "keyword": "unknown",
      }
    `);
  });

  test("`any`", () => {
    const anyType = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/any/v/1"),
      S.any.pipe(S.title("A constant any value")),
    );

    const error = Either.flip(anyType).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedType",
          "type": "any",
        }
      `);
  });

  test("unique symbol", () => {
    const symbol = Symbol.for("unique symbol");

    const uniqueSymbol = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/unique-symbol/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.uniqueSymbolFromSelf(symbol).pipe(S.title("A unique symbol")),
    );

    const error = Either.flip(uniqueSymbol).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedKeyword",
          "keyword": "unique symbol",
        }
      `);
  });
});

describe("types", () => {
  test("declaration", () => {
    class File {}

    const isFile = (input: unknown): input is File => input instanceof File;

    const FileFromSelf = S.declare(isFile, {
      identifier: "FileFromSelf",
    });

    const declaration = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/declaration/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      FileFromSelf.pipe(S.title("A custom declaration")),
    );

    const error = Either.flip(declaration).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedNode",
          "node": "Declaration",
        }
      `);
  });

  test("bigint", () => {
    const bigInt = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/bigint/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.bigintFromSelf.pipe(S.title("A bigint")),
    );

    const error = Either.flip(bigInt).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedType",
          "type": "bigint",
        }
      `);
  });

  test("object", () => {
    const object = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/object/v/1"),
      // @ts-expect-error we are just making sure this will fail!
      S.object,
    );

    const error = Either.flip(object).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedType",
          "type": "object",
        }
      `);
  });
});

describe("string", () => {
  test("standard", () => {
    const string = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/string/v/1"),
      S.string,
    );

    const dataType = Either.getOrThrow(string);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a string",
          "kind": "dataType",
          "title": "string",
          "type": "string",
        }
      `);
  });

  test("minLength", () => {
    const string = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/string/v/1"),
      S.string.pipe(S.minLength(5)),
    );

    const dataType = Either.getOrThrow(string);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a string",
          "kind": "dataType",
          "minLength": 5,
          "title": "string",
          "type": "string",
        }
      `);
  });

  test("maxLength", () => {
    const string = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/string/v/1"),
      S.string.pipe(S.maxLength(5)),
    );

    const dataType = Either.getOrThrow(string);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a string",
          "kind": "dataType",
          "maxLength": 5,
          "title": "string",
          "type": "string",
        }
      `);
  });

  test("pattern", () => {
    const string = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/string/v/1"),
      S.string.pipe(S.pattern(/abc/)),
    );

    const dataType = Either.getOrThrow(string);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a string",
          "kind": "dataType",
          "pattern": "abc",
          "title": "string",
          "type": "string",
        }
      `);
  });

  // TODO: test -> wrong annotation type
});

describe("number", () => {
  test("standard", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number,
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("integer", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.Int,
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "title": "number",
          "type": "integer",
        }
      `);
  });

  test("multipleOf", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number.pipe(S.multipleOf(5)),
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "multipleOf": 5,
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("minimum", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number.pipe(S.greaterThanOrEqualTo(5)),
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "minimum": 5,
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("maximum", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number.pipe(S.lessThanOrEqualTo(5)),
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "maximum": 5,
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("exclusiveMinimum", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number.pipe(S.greaterThan(5)),
    );

    const literal = Either.getOrThrow(number);

    expect(DataType.toSchema(literal)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "exclusiveMinimum": 5,
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("exclusiveMaximum", () => {
    const number = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
      S.number.pipe(S.lessThan(5)),
    );

    const dataType = Either.getOrThrow(number);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "exclusiveMaximum": 5,
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });
});

test("boolean", () => {
  const boolean = DataType.make(
    DataTypeUrl.parseOrThrow("https://example.com/boolean/v/1"),
    S.boolean,
  );

  const dataType = Either.getOrThrow(boolean);
  expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
      {
        "$id": "https://example.com/boolean/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        "description": "a boolean",
        "kind": "dataType",
        "title": "boolean",
        "type": "boolean",
      }
    `);
});

test("null", () => {
  const nullType = DataType.make(
    DataTypeUrl.parseOrThrow("https://example.com/null/v/1"),
    S.null.pipe(S.title("A null")),
  );

  const dataType = Either.getOrThrow(nullType);
  expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
    {
      "$id": "https://example.com/null/v/1",
      "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      "kind": "dataType",
      "title": "A null",
      "type": "null",
    }
  `);
});

describe("enums", () => {
  test("numeric (consecutive)", () => {
    enum Fruits {
      Apple,
      Banana,
    }

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const dataType = Either.getOrThrow(enums);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/enums/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "kind": "dataType",
          "maximum": 1,
          "minimum": 0,
          "title": "A fruit",
          "type": "integer",
        }
      `);
  });

  test("numeric (holes)", () => {
    enum Fruits {
      Apple = 0,
      Banana = 2,
    }

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const error = Either.flip(enums).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(
      `
        {
          "_tag": "MalformedEnum",
          "reason": "non-consecutive integer values",
        }
      `,
    );
  });

  test("numeric (floating)", () => {
    enum Fruits {
      Apple = 0.5,
      Banana = 1.5,
    }

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const error = Either.flip(enums).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(
      `
        {
          "_tag": "MalformedEnum",
          "reason": "floating point values",
        }
      `,
    );
  });

  test("string", () => {
    enum Fruits {
      Apple = "apple",
      Banana = "banana",
    }

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const dataType = Either.getOrThrow(enums);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/enums/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "kind": "dataType",
          "pattern": "^(apple)|(banana)$",
          "title": "A fruit",
          "type": "string",
        }
      `);
  });

  test("mixed", () => {
    enum Fruits {
      Apple = "apple",
      Banana = 1,
    }

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const error = Either.flip(enums).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(
      `
        {
          "_tag": "MalformedEnum",
          "reason": "mixed",
        }
      `,
    );
  });

  test("empty", () => {
    enum Fruits {}

    const enums = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/enums/v/1"),
      S.enums(Fruits).pipe(S.title("A fruit")),
    );

    const error = Either.flip(enums).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(
      `
        {
          "_tag": "MalformedEnum",
          "reason": "empty",
        }
      `,
    );
  });
});

test("template literal", () => {
  const templateLiteral = DataType.make(
    DataTypeUrl.parseOrThrow("https://example.com/template-literal/v/1"),
    S.templateLiteral(S.literal(123), S.string).pipe(
      S.title("A template literal"),
    ),
  );

  const dataType = Either.getOrThrow(templateLiteral);
  expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
      {
        "$id": "https://example.com/template-literal/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
        "kind": "dataType",
        "pattern": "^123.*$",
        "title": "A template literal",
        "type": "string",
      }
    `);
});

describe("union", () => {
  test("single", () => {
    const union = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/union/v/1"),
      S.union(S.literal(123)).pipe(S.title("A union")),
    );

    const dataType = Either.getOrThrow(union);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/union/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": 123,
          "kind": "dataType",
          "title": "A union",
          "type": "number",
        }
      `);
  });

  test("multiple", () => {
    const union = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/union/v/1"),
      S.union(S.literal(123), S.literal("abc")).pipe(S.title("A union")),
    );

    const error = Either.flip(union).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedNode",
          "node": "Union",
        }
      `);
  });
});

describe("array", () => {
  test("empty list", () => {
    // the only type that BP 0.3 supports
    const array = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/array/v/1"),
      S.tuple().pipe(S.title("An empty array")),
    );

    const dataType = Either.getOrThrow(array);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/array/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": [],
          "kind": "dataType",
          "title": "An empty array",
          "type": "array",
        }
      `);
  });

  test("tuple", () => {
    const array = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/array/v/1"),
      S.tuple(S.literal(123), S.literal("abc")).pipe(S.title("A tuple")),
    );

    const error = Either.flip(array).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedType",
          "type": "tuple",
        }
      `);
  });

  test("array", () => {
    const array = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/array/v/1"),
      S.array(S.literal(123)).pipe(S.title("An array")),
    );

    const error = Either.flip(array).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "UnsupportedType",
          "type": "array",
        }
      `);
  });
});

describe("suspend", () => {
  test("standard", () => {
    const Indirection = S.suspend(() => S.number);

    const suspend = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/suspend/v/1"),
      Indirection.pipe(S.title("A suspend")),
    );

    const dataType = Either.getOrThrow(suspend);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/suspend/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });
  test("double", () => {
    const IndirectionA = S.suspend(() => S.number);
    const IndirectionB = S.suspend(() => IndirectionA);

    const suspend = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/suspend/v/1"),
      IndirectionB.pipe(S.title("A suspend")),
    );

    const dataType = Either.getOrThrow(suspend);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/suspend/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("triple", () => {
    const IndirectionA = S.suspend(() => S.number);
    const IndirectionB = S.suspend(() => IndirectionA);
    const IndirectionC = S.suspend(() => IndirectionB);

    const suspend = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/suspend/v/1"),
      IndirectionC.pipe(S.title("A suspend")),
    );

    const dataType = Either.getOrThrow(suspend);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/suspend/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "a number",
          "kind": "dataType",
          "title": "number",
          "type": "number",
        }
      `);
  });

  test("cyclic", () => {
    type Value = number;
    const Schema = S.suspend((): S.Schema<Value> => Schema);

    const suspend = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/suspend/v/1"),
      Schema.pipe(S.title("A suspend")),
    );

    const error = Either.flip(suspend).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "CyclicSchema",
        }
      `);
  });

  test("cyclic: triple", () => {
    type Value = number;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const SchemaA = S.suspend((): S.Schema<Value> => SchemaB);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const SchemaB = S.suspend((): S.Schema<Value> => SchemaC);
    const SchemaC = S.suspend((): S.Schema<Value> => SchemaA);

    const suspend = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/suspend/v/1"),
      SchemaA.pipe(S.title("A suspend")),
    );

    const error = Either.flip(suspend).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
        {
          "_tag": "CyclicSchema",
        }
      `);
  });
});

describe("TypeLiteral", () => {
  test("record", () => {
    const record = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/record/v/1"),
      S.record(S.string, Json.Value).pipe(S.title("A record")),
    );

    const dataType = Either.getOrThrow(record);
    expect(DataType.toSchema(dataType)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/record/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "kind": "dataType",
          "title": "A record",
          "type": "object",
        }
      `);
  });

  test("record: literal key", () => {
    const record = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/record/v/1"),
      S.record(S.literal("key"), Json.Value).pipe(S.title("A record")),
    );

    const error = Either.flip(record).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "UnsupportedType",
        "type": "struct",
      }
    `);
  });

  test("record: template key", () => {
    const record = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/record/v/1"),
      S.record(S.templateLiteral(S.literal("key"), S.string), Json.Value).pipe(
        S.title("A record"),
      ),
    );

    const error = Either.flip(record).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "MalformedRecord",
        "reason": "parameter must be a string",
      }
    `);
  });

  test("record: integer value", () => {
    const record = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/record/v/1"),
      S.record(S.string, S.Int).pipe(S.title("A record")),
    );

    const error = Either.flip(record).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "MalformedRecord",
        "reason": "value is not of type \`Json.Value\`",
      }
    `);
  });

  test("struct", () => {
    const struct = DataType.make(
      DataTypeUrl.parseOrThrow("https://example.com/struct/v/1"),
      S.struct({
        key: S.string,
      }).pipe(S.title("A struct")),
    );

    const error = Either.flip(struct).pipe(Either.getOrThrow);
    expect(error.reason).toMatchInlineSnapshot(`
      {
        "_tag": "UnsupportedType",
        "type": "struct",
      }
    `);
  });
});
