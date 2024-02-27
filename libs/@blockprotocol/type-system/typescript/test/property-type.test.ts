import {
  ParsePropertyTypeError,
  PropertyType,
  TypeSystemInitializer,
  validatePropertyType,
} from "..";

const propertyTypes: PropertyType[] = [
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/age/v/1",
    title: "Age",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/contact-information/v/1",
    title: "Contact Information",
    oneOf: [
      {
        type: "object",
        properties: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/email/":
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/email/v/1",
            },
          "https://blockprotocol.org/@blockprotocol/types/property-type/phone-number/":
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/phone-number/v/1",
            },
        },
        required: [
          "https://blockprotocol.org/@blockprotocol/types/property-type/email/",
        ],
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/contrived-property/v/1",
    title: "Contrived Property",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            },
          ],
        },
        maxItems: 4,
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/favorite-quote/v/1",
    title: "Favorite Quote",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/interests/v/1",
    title: "Interests",
    oneOf: [
      {
        type: "object",
        properties: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/favorite-film/":
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/favorite-film/v/1",
            },
          "https://blockprotocol.org/@blockprotocol/types/property-type/favorite-song/":
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/favorite-song/v/1",
            },
          "https://blockprotocol.org/@blockprotocol/types/property-type/hobby/":
            {
              type: "array",
              items: {
                $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/hobby/v/1",
              },
            },
        },
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/name/v/1",
    title: "Name",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/numbers/v/1",
    title: "Numbers",
    oneOf: [
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            },
          ],
        },
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/text/v/1",
    title: "Text",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/user-id/v/1",
    title: "User ID",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    $schema:
      "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
    kind: "propertyType",
    $id: "https://blockprotocol.org/@alice/types/property-type/user-id/v/2",
    title: "User ID",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
    ],
  },
];

// These are data types which satisfy the TypeScript interface but are still invalid, and demonstrate the need for the
// validation method
const invalidPropertyTypes: [string, PropertyType, ParsePropertyTypeError][] = [
  [
    "non-integer version",
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: "https://blockprotocol.org/@blockprotocol/types/property-type/broken/v/1.4",
      title: "Broken",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
    },
    {
      reason: "InvalidVersionedUrl",
      inner: {
        reason: "AdditionalEndContent",
        inner: ".4",
      },
    },
  ],
  [
    "invalid base URL",
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: "https://  /broken/v/1",
      title: "Broken",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
        },
      ],
    },
    {
      reason: "InvalidVersionedUrl",
      inner: {
        reason: "InvalidBaseUrl",
        inner: {
          reason: "UrlParseError",
          inner: "invalid domain character",
        },
      },
    },
  ],
  [
    "invalid ref",
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: "https://blockprotocol.org/@blockprotocol/types/property-type/broken/v/1",
      title: "Broken",
      oneOf: [
        {
          $ref: "im a broken ref haha /v/1",
        },
      ],
    },
    {
      reason: "InvalidOneOf",
      inner: {
        reason: "PropertyValuesError",
        inner: {
          reason: "InvalidDataTypeReference",
          inner: {
            reason: "InvalidBaseUrl",
            inner: {
              reason: "UrlParseError",
              inner: "relative URL without a base",
            },
          },
        },
      },
    },
  ],
  [
    "invalid property type object",
    {
      $schema:
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: "https://blockprotocol.org/@blockprotocol/types/property-type/broken/v/1",
      title: "Broken",
      oneOf: [
        {
          type: "object",
          properties: {
            "https://blockprotocol.org/@blockprotocol/types/property-type/broken/v/1":
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/property-type/broken/v/1",
              },
          },
        },
      ],
    },
    {
      reason: "InvalidOneOf",
      inner: {
        reason: "PropertyValuesError",
        inner: {
          reason: "InvalidPropertyTypeObject",
          inner: {
            reason: "InvalidPropertyKey",
            inner: {
              reason: "MissingTrailingSlash",
            },
          },
        },
      },
    },
  ],
];
// Quick sanity check that passing in a completely different object also throws an error cleanly, this shouldn't be
// normally possible if we don't do something silly like the use of any below. This sanity check is important because
// it is possible for wasm to error in unusual ways that can't easily be handled, and that should be viewed as a bug.
const brokenTypes: [unknown, ParsePropertyTypeError][] = [
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
        "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
      kind: "propertyType",
      $id: "https://blockprotocol.org/@blockprotocol/types/property-type/empty-one-of/v/1",
      title: "Broken",
      oneOf: [],
    },
    {
      reason: "InvalidOneOf",
      inner: {
        reason: "ValidationError",
        inner: {
          type: "EmptyOneOf",
        },
      },
    },
  ],
  [
    {
      $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/foo",
      kind: "propertyType",
      $id: "https://blockprotocol.org/@blockprotocol/types/property-type/invalid-meta-schema/v/1",
      title: "Broken",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      ],
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

describe("validatePropertyType", () => {
  test.each(propertyTypes)("validatePropertyType($title) succeeds", (input) => {
    expect(validatePropertyType(input)).toEqual({ type: "Ok", inner: null });
  });

  test.each(invalidPropertyTypes)(
    "validatePropertyType returns errors on: %s",
    (_, input, expected) => {
      expect(validatePropertyType(input)).toEqual({
        type: "Err",
        inner: expected,
      });
    },
  );

  test.each(brokenTypes)(
    "validatePropertyType cleanly returns errors on different type: %s",
    (input, expected) => {
      expect(validatePropertyType(input)).toEqual({
        type: "Err",
        inner: expected,
      });
    },
  );
});
