import {
  DataType,
  ParseDataTypeError,
  TypeSystemInitializer,
  validateDataType,
} from "..";

const primitiveDataTypes: DataType[] = [
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
    title: "Boolean",
    description: "A True or False value",
    type: "boolean",
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1",
    title: "Empty List",
    description: "An Empty List",
    type: "array",
    const: [],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
    title: "Null",
    description: "A placeholder value representing 'nothing'",
    type: "null",
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    title: "Number",
    description: "An arithmetical value (in the Real number system)",
    type: "number",
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    title: "Object",
    description: "A plain JSON object with no pre-defined structure",
    type: "object",
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    title: "Text",
    description: "An ordered sequence of characters",
    type: "string",
  },
];

// These are data types which satisfy the TypeScript interface but are still invalid, and demonstrate the need for the
// validation method
const invalidDataTypes: [DataType, ParseDataTypeError][] = [
  [
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      kind: "dataType",
      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/2.3", // incorrectly versioned URL
      title: "Text",
      description: "An ordered sequence of characters",
      type: "string",
    },
    {
      reason: "InvalidVersionedUrl",
      inner: {
        reason: "AdditionalEndContent",
        inner: ".3",
      },
    },
  ],
];

// Quick sanity check that passing in a completely different object also throws an error cleanly, this shouldn't be
// normally possible if we don't do something silly like the use of any below. This sanity check is important because
// it is possible for wasm to error in unusual ways that can't easily be handled, and that should be viewed as a bug.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const brokenTypes: [any, ParseDataTypeError][] = [
  [
    {},
    {
      reason: "InvalidJson",
      inner: "missing field `$schema` at line 1 column 2",
    },
  ],
  [
    { foo: "bar" },
    {
      reason: "InvalidJson",
      inner: "missing field `$schema` at line 1 column 13",
    },
  ],
  [
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
      kind: "dataType",
      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      title: "Text",
    },
    {
      reason: "InvalidJson",
      inner: "missing field `type` at line 1 column 187",
    },
  ],
  [
    {
      $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/foo",
      kind: "dataType",
      $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      title: "Text",
      type: "string",
    },
    {
      reason: "InvalidMetaSchema",
      inner: "https://blockprotocol.org/types/modules/graph/0.3/schema/foo",
    },
  ],
];

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
});

describe("validateDataType", () => {
  test.each(primitiveDataTypes)(
    "validateDataType($title) succeeds",
    (input) => {
      expect(validateDataType(input)).toEqual({ type: "Ok", inner: null });
    },
  );

  test.each(invalidDataTypes)(
    "validateDataType returns errors on invalid data type: %s",
    (input, expected) => {
      expect(validateDataType(input)).toEqual({ type: "Err", inner: expected });
    },
  );

  test.each(brokenTypes)(
    "validateDataType cleanly returns errors on different type: %s",
    (input, expected) => {
      expect(validateDataType(input)).toEqual({ type: "Err", inner: expected });
    },
  );
});
