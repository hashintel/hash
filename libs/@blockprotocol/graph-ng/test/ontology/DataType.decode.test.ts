import { Either } from "effect";
import { describe, expect, test } from "vitest";

import * as DataType from "../../src/ontology/DataType.js";
import { DataTypeUrl } from "../../src/ontology/index.js";

describe("literal", () => {
  test("`number`", () => {
    const schema = {
      $id: DataTypeUrl.parseOrThrow("https://example.com/number-123/v/1"),
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      const: 123,
      kind: "dataType",
      title: "A constant number of value `123`",
      type: "number",
    } satisfies DataType.Schema;

    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("`string`", () => {
    const schema = {
      $id: DataTypeUrl.parseOrThrow("https://example.com/string-abc/v/1"),
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      const: "abc",
      kind: "dataType",
      title: "A constant string of value `abc`",
      type: "string",
    } satisfies DataType.Schema;

    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("`boolean`", () => {
    const schema = {
      $id: DataTypeUrl.parseOrThrow("https://example.com/boolean-true/v/1"),
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      const: true,
      kind: "dataType",
      title: "A constant boolean of value `true`",
      type: "boolean",
    } satisfies DataType.Schema;

    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("`null`", () => {
    const schema = {
      $id: DataTypeUrl.parseOrThrow("https://example.com/null/v/1"),
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      const: null,
      kind: "dataType",
      title: "A constant null value",
      type: "null",
    } satisfies DataType.Schema;

    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });
});

describe("string", () => {
  const base = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/string/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "a string",
    kind: "dataType",
    title: "string",
    type: "string",
  } satisfies DataType.Schema;

  test("standard", () => {
    const schema = base;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("minLength", () => {
    const schema = {
      ...base,
      minLength: 1,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("maxLength", () => {
    const schema = {
      ...base,
      maxLength: 10,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("pattern", () => {
    const schema = {
      ...base,
      pattern: "^[a-z]+$",
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("minLength, maxLength, pattern", () => {
    const schema = {
      ...base,
      minLength: 1,
      maxLength: 10,
      pattern: "^[a-z]+$",
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });
});

describe("number", () => {
  const base = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/number/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "a number",
    kind: "dataType",
    title: "number",
    type: "number",
  } satisfies DataType.Schema;

  test("number", () => {
    const schema = base;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("integer", () => {
    const schema = {
      ...base,
      type: "integer",
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("multipleOf", () => {
    const schema = {
      ...base,
      multipleOf: 2,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("minimum", () => {
    const schema = {
      ...base,
      minimum: 0,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("maximum", () => {
    const schema = {
      ...base,
      maximum: 100,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("exclusiveMinimum", () => {
    const schema = {
      ...base,
      exclusiveMinimum: 0,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("exclusiveMaximum", () => {
    const schema = {
      ...base,
      exclusiveMaximum: 100,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });

  test("integer, multipleOf, minimum, maximum, exclusiveMinimum, exclusiveMaximum", () => {
    const schema = {
      ...base,
      type: "integer",
      multipleOf: 2,
      minimum: 0,
      maximum: 100,
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
    } satisfies DataType.Schema;
    const result = DataType.fromSchema(schema);
    const dataType = Either.getOrThrow(result);

    expect(dataType).toMatchSnapshot();
  });
});

test("boolean", () => {
  const schema = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/boolean/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "a boolean",
    kind: "dataType",
    title: "boolean",
    type: "boolean",
  } satisfies DataType.Schema;

  const result = DataType.fromSchema(schema);
  const dataType = Either.getOrThrow(result);

  expect(dataType).toMatchSnapshot();
});

test("null", () => {
  const schema = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/null/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "a null",
    kind: "dataType",
    title: "null",
    type: "null",
  } satisfies DataType.Schema;

  const result = DataType.fromSchema(schema);
  const dataType = Either.getOrThrow(result);

  expect(dataType).toMatchSnapshot();
});

test("array", () => {
  const schema = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/array/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "an array",
    kind: "dataType",
    title: "array",
    type: "array",
    const: [],
  } satisfies DataType.Schema;

  const result = DataType.fromSchema(schema);
  const dataType = Either.getOrThrow(result);

  expect(dataType).toMatchSnapshot();
});

test("object", () => {
  const schema = {
    $id: DataTypeUrl.parseOrThrow("https://example.com/object/v/1"),
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    description: "an object",
    kind: "dataType",
    title: "object",
    type: "object",
  } satisfies DataType.Schema;

  const result = DataType.fromSchema(schema);
  const dataType = Either.getOrThrow(result);

  expect(dataType).toMatchSnapshot();
});
