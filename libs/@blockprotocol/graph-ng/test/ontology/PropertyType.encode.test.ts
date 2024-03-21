import * as S from "@effect/schema/Schema";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import * as BuiltIn from "../../src/ontology/DataType/BuiltIn.js";
import * as PropertyType from "../../src/ontology/PropertyType.js";
import * as PropertyTypeUrl from "../../src/ontology/PropertyTypeUrl.js";
import { runError } from "../utils.js";

describe("DataType", () => {
  test("standard", () => {
    const description = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
      ),
      BuiltIn.Text.v1.schema.pipe(PropertyType.isolate, S.title("Description")),
    );

    const propertyType = Effect.runSync(description);
    const schema = Effect.runSync(PropertyType.toSchema(propertyType));

    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        ],
        "title": "Description",
      }
    `);
  });

  test("not actual DataType", () => {
    const description = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
      ),
      S.string.pipe(S.title("Description")),
    );

    const error = runError(description);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "UnableToEncode",
            "node": {
              "_tag": "StringKeyword",
              "annotations": {
                "Symbol(@blockprotocol/graph/ontology/PropertyType/Annotation)": [Function],
                "Symbol(@effect/schema/annotation/Description)": "a string",
                "Symbol(@effect/schema/annotation/Title)": "Description",
              },
            },
          },
        },
      }
    `);
  });
});

describe("PropertyObject", () => {
  const description = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
    ),
    BuiltIn.Text.v1.schema.pipe(PropertyType.isolate, S.title("Description")),
  ).pipe(Effect.runSync);

  test("nested PropertyType", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          description.schema,
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("nested PropertyType - optional", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.optional(description.schema),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
              },
            },
            "required": [],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test("array of PropertyTypes", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.array(description.schema),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                },
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("array of PropertyTypes - optional", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.optional(S.array(description.schema)),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                },
                "type": "array",
              },
            },
            "required": [],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("array of PropertyTypes - minItems", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.array(description.schema).pipe(S.minItems(1)),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                },
                "minItems": 1,
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("array of PropertyTypes - maxItems", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.array(description.schema).pipe(S.maxItems(1)),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                },
                "maxItems": 1,
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("array of PropertyTypes - tuple", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.tuple(description.schema, description.schema),
      }).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                },
                "maxItems": 2,
                "minItems": 2,
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test.todo("multiple keys - nested PropertyTypes", () => {});
  test.todo("multiple keys - array of PropertyTypes", () => {});
  test.todo("multiple keys - mixed", () => {});

  test("recursive PropertyType", () => {
    interface FileProperties {
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": FileProperties;
    }

    const lazyFileProperties = PropertyType.makeLazy(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
          S.suspend((): S.Schema<FileProperties> => lazyFileProperties.schema),
      }).pipe(S.title("File Properties")),
    );

    const fileProperties = Effect.runSync(
      PropertyType.validateLazy(lazyFileProperties),
    );

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "properties": {
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": {
                "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test.todo("incorrect keys", () => {});
  test.todo("value is not nested or array of nested", () => {});
});

describe("ArrayOfPropertyValues", () => {
  test.todo("DataType", () => {});
  test.todo("PropertyObject", () => {});
  test.todo("ArrayOfPropertyValues", () => {});

  test.todo("multiple oneOf", () => {});

  test.todo("inner not PropertyValues", () => {});
});

describe("oneOf: PropertyValues", () => {
  test.todo("DataType + PropertyObject", () => {});
  test.todo("DataType + ArrayOfPropertyValues", () => {});
  test.todo("PropertyObject + ArrayOfPropertyValues", () => {});
  test.todo("DataType + PropertyObject + ArrayOfPropertyValues", () => {});
  test.todo("DataType + PropertyObject + DataType + PropertyObject", () => {});
  test.todo(
    "DataType + PropertyObject + DataType + ArrayOfPropertyValues",
    () => {},
  );

  test.todo(
    "inner not DataType/PropertyObject/ArrayOfPropertyValues",
    () => {},
  );

  test.todo("refinement applied to union", () => {});
  test.todo("transformation applied to union", () => {});
  test.todo("suspense applied to union", () => {});
  test.todo(
    "refinement + transformation + suspense applied to union",
    () => {},
  );
});
