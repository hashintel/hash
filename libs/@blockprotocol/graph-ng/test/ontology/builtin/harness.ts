import { expect, test } from "vitest";
import * as S from "@effect/schema/Schema";
import * as Null from "../../../src/ontology/builtin/Null";
import * as DataType from "../../../src/ontology/DataType";
import * as NullType from "../../../src/ontology/internal/NullDataType";

export function testAgainstTypes<T extends DataType.DataType>(
  version: string,
  schema: T,
  shouldSucceed:
    | "string"
    | "number"
    | "boolean"
    | "null"
    | "object"
    | "emptyList",
) {
  const Schema = DataType.makeValueSchema(schema) as S.Schema<unknown, unknown>;

  test(`v${version}: parse string`, () => {
    if (shouldSucceed !== "string") {
      expect(() => S.decodeUnknownSync(Schema)("example")).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)("example");
      expect(value).toBe("example");
    }
  });

  test(`v${version}: parse number`, () => {
    if (shouldSucceed !== "number") {
      expect(() => S.decodeUnknownSync(Schema)(1)).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)(1);
      expect(value).toBe(1);
    }
  });

  test(`v${version}: parse boolean`, () => {
    if (shouldSucceed !== "boolean") {
      expect(() => S.decodeUnknownSync(Schema)(true)).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)(true);
      expect(value).toBe(true);
    }
  });

  test(`v${version}: parse null`, () => {
    if (shouldSucceed !== "null") {
      expect(() => S.decodeUnknownSync(Schema)(null)).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)(null);
      expect(value).toBe(null);
    }
  });

  test(`v${version}: parse object`, () => {
    if (shouldSucceed !== "object") {
      expect(() => S.decodeUnknownSync(Schema)({})).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)({});
      expect(value).toEqual({});
    }
  });

  test(`v${version}: parse emptyList`, () => {
    if (shouldSucceed !== "emptyList") {
      expect(() => S.decodeUnknownSync(Schema)([])).toThrow();
    } else {
      const value = S.decodeUnknownSync(Schema)([]);
      expect(value).toEqual([]);
    }
  });
}
