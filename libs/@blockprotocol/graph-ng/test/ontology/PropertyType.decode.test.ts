import * as S from "@effect/schema/Schema";
import { Effect, ReadonlyArray, ReadonlyRecord } from "effect";
import { NoSuchElementException } from "effect/Cause";
import { expect, test } from "vitest";

import * as DataType from "../../src/ontology/DataType.js";
import * as BuiltIn from "../../src/ontology/DataType/BuiltIn.js";
import * as DataTypeUrl from "../../src/ontology/DataTypeUrl.js";
import * as O from "../../src/ontology/OntologySchema.js";
import { OntologyStore } from "../../src/ontology/OntologyStore.js";
import * as PropertyType from "../../src/ontology/PropertyType.js";
import { PropertyTypeSchema } from "../../src/ontology/PropertyType/schema.js";
import * as PropertyTypeUrl from "../../src/ontology/PropertyTypeUrl.js";
import { runError } from "../utils.js";

const TestOntologyStore = (
  propertyTypes: readonly PropertyType.PropertyType<unknown>[],
): OntologyStore<NoSuchElementException> => ({
  dataType: (
    url: DataTypeUrl.DataTypeUrl,
  ): Effect.Effect<DataType.DataType<unknown>, NoSuchElementException, never> =>
    Effect.gen(function* (_) {
      return yield* _(
        BuiltIn as Record<string, Record<string, unknown>>,
        ReadonlyRecord.values,
        ReadonlyArray.flatMap(ReadonlyRecord.values),
        ReadonlyArray.filter(DataType.isDataType),
        ReadonlyArray.findFirst((type) => type.id === url),
      );
    }),
  propertyType: (
    url: PropertyTypeUrl.PropertyTypeUrl,
  ): Effect.Effect<
    PropertyType.PropertyType<unknown>,
    NoSuchElementException,
    never
  > =>
    Effect.gen(function* (_) {
      return yield* _(
        propertyTypes,
        ReadonlyArray.findFirst((type) => type.id === url),
      );
    }),
});

const description = {
  $schema:
    "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
  $id: PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
  ),
  kind: "propertyType",
  title: "Description",

  oneOf: [
    {
      $ref: BuiltIn.Text.v1.id,
    },
  ],
} satisfies PropertyTypeSchema;

const descriptionType = PropertyType.make(
  description.$id,
  O.dataType(BuiltIn.Text.v1).pipe(S.title("Description")),
).pipe(Effect.runSync);

test("DataType", () => {
  const store = TestOntologyStore([]);

  const propertyType = PropertyType.fromSchema(description, store).pipe(
    Effect.runSync,
  );
  expect(propertyType).toMatchSnapshot();

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(schema("123")).toBe("123");
  expect(() => schema(123)).toThrowErrorMatchingSnapshot();
});

test("DataType: type does not exist", () => {
  const store = TestOntologyStore([]);

  const invalidDescription = {
    ...description,
    oneOf: [
      {
        $ref: "invalid" as DataTypeUrl.DataTypeUrl,
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(invalidDescription, store);
  const error = runError(propertyType);
  expect(error).toMatchSnapshot();
});

const file = {
  $schema:
    "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
  $id: PropertyTypeUrl.parseOrThrow(
    "https://blockprotocol.org/@blockprotocol/types/property-type/file/v/1",
  ),
  kind: "propertyType",
  title: "File",

  oneOf: [
    {
      type: "object",
      properties: {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          {
            $ref: description.$id,
          },
      },
      required: [
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
      ],
    },
  ],
} satisfies PropertyTypeSchema;

test("PropertyObject", () => {
  const store = TestOntologyStore([
    descriptionType as unknown as PropertyType.PropertyType<unknown>,
  ]);

  const propertyType = PropertyType.fromSchema(file, store).pipe(
    Effect.runSync,
  );
  expect(propertyType).toMatchSnapshot();

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(
    schema({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        "123",
    }),
  ).toMatchSnapshot();
  expect(() =>
    schema({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/": 123,
    }),
  ).toThrowErrorMatchingSnapshot();
});
// TODO: improve errors
test("PropertyObject: type does not exist", () => {
  const store = TestOntologyStore([]);

  const propertyType = PropertyType.fromSchema(file, store);
  const error = runError(propertyType);
  expect(error).toMatchSnapshot();
});
test("PropertyObject: optional", () => {
  const store = TestOntologyStore([
    descriptionType as unknown as PropertyType.PropertyType<unknown>,
  ]);

  const optionalFile = {
    ...file,
    oneOf: [
      {
        ...file.oneOf[0],
        required: [],
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(optionalFile, store).pipe(
    Effect.runSync,
  );

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(schema({})).toMatchSnapshot();
  expect(
    schema({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        "123",
    }),
  ).toMatchSnapshot();
  expect(() =>
    schema({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/": 123,
    }),
  ).toThrowErrorMatchingSnapshot();
});
test("ArrayOfPropertyValues", () => {
  const store = TestOntologyStore([]);

  const arrayOfFile = {
    ...file,
    oneOf: [
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: BuiltIn.Text.v1.id,
            },
          ],
        },
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(arrayOfFile, store).pipe(
    Effect.runSync,
  );

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(schema(["123"])).toMatchSnapshot();
  expect(() => schema([123])).toThrowErrorMatchingSnapshot();
});
test("ArrayOfPropertyValues: mixed", () => {
  const store = TestOntologyStore([]);

  const arrayOfFile = {
    ...file,
    oneOf: [
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: BuiltIn.Text.v1.id,
            },
            {
              $ref: BuiltIn.Number.v1.id,
            },
          ],
        },
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(arrayOfFile, store).pipe(
    Effect.runSync,
  );

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(schema(["123", 123])).toMatchSnapshot();
  expect(() => schema([[]])).toThrowErrorMatchingSnapshot();
});

test("mixed", () => {
  const store = TestOntologyStore([
    descriptionType as unknown as PropertyType.PropertyType<unknown>,
  ]);

  const mixedFile = {
    ...file,
    oneOf: [
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: BuiltIn.Text.v1.id,
            },
            {
              type: "object",
              properties: {
                "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
                  {
                    $ref: description.$id,
                  },
              },
              required: [
                "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
              ],
            },
          ],
        },
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(mixedFile, store).pipe(
    Effect.runSync,
  );

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(schema(["123"])).toMatchSnapshot();
  expect(
    schema([
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          "123",
      },
    ]),
  ).toMatchSnapshot();
  expect(() => schema([123])).toThrowErrorMatchingSnapshot();
});

test("recursive", () => {
  const store = TestOntologyStore([]);

  const recursiveFile = {
    ...file,

    oneOf: [
      {
        type: "object",
        properties: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file/":
            {
              $ref: file.$id,
            },
        },
        required: [],
      },
    ],
  } as PropertyTypeSchema;

  const propertyType = PropertyType.fromSchema(recursiveFile, store).pipe(
    Effect.runSync,
  );

  const schema = S.decodeUnknownSync(propertyType.schema);
  expect(() => schema(123)).toThrowErrorMatchingSnapshot();
  expect(
    schema({
      "https://blockprotocol.org/@blockprotocol/types/property-type/file/": {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file/": {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file/":
            {},
        },
      },
    }),
  ).toMatchSnapshot();
});
