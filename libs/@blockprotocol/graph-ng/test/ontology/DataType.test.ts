import { describe, test, expect } from "vitest";
import * as S from "@effect/schema/Schema";
import * as DataType from "../../src/ontology/DataType";
import * as DataTypeUrl from "../../src/ontology/DataTypeUrl";
import { Either, Option } from "effect";

describe("DataType: literal", () => {
  describe("encode", () => {
    test("`number`", () => {
      const numberLiteral = DataType.make(
        DataTypeUrl.parseOrThrow("https://example.com/number-123/v/1"),
        S.literal(123).pipe(S.title("A constant number of value `123`")),
      );

      const literal = Either.getOrThrow(numberLiteral);

      expect(DataType.toSchema(literal)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/number-123/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": 123,
          "description": undefined,
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

      const literal = Either.getOrThrow(stringLiteral);

      expect(DataType.toSchema(literal)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/string-abc/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": "abc",
          "description": undefined,
          "kind": "dataType",
          "title": "A constant string of value \`abc\`",
          "type": "string",
        }
      `);
    });

    test("`bool`", () => {
      const booleanLiteral = DataType.make(
        DataTypeUrl.parseOrThrow("https://example.com/boolean-true/v/1"),
        S.literal(true).pipe(S.title("A constant boolean of value `true`")),
      );

      const literal = Either.getOrThrow(booleanLiteral);

      expect(DataType.toSchema(literal)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/boolean-true/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": true,
          "description": undefined,
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

      const literal = Either.getOrThrow(nullLiteral);

      expect(DataType.toSchema(literal)).toMatchInlineSnapshot(`
        {
          "$id": "https://example.com/null/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": undefined,
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
});
