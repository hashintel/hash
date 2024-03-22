import * as S from "@effect/schema/Schema";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import * as BuiltIn from "../../src/ontology/DataType/BuiltIn.js";
import * as O from "../../src/ontology/OntologySchema.js";
import * as PropertyType from "../../src/ontology/PropertyType.js";
import * as PropertyTypeUrl from "../../src/ontology/PropertyTypeUrl.js";
import { runError } from "../utils.js";
import { LazyPropertyType } from "../../src/ontology/PropertyType.js";

describe("DataType", () => {
  test("standard", () => {
    const description = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
      ),
      O.dataType(BuiltIn.Text.v1).pipe(S.title("Description")),
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
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Description")),
  ).pipe(Effect.runSync);

  const displayName = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
    ),
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Display Name")),
  ).pipe(Effect.runSync);

  test("nested PropertyType", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          O.propertyType(description),
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
          S.optional(O.propertyType(description)),
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
          S.array(O.propertyType(description)),
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
          S.optional(S.array(O.propertyType(description))),
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
          S.array(O.propertyType(description)).pipe(S.minItems(1)),
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
          S.array(O.propertyType(description)).pipe(S.maxItems(1)),
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
          S.tuple(O.propertyType(description), O.propertyType(description)),
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
  test("array of PropertyTypes - tuple - heterogeneous", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.tuple(O.propertyType(description), O.propertyType(displayName)),
      }).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "tuple elements must be the same",
          },
        },
      }
    `);
  });
  test("array of PropertyTypes - tuple - trailing elements", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.tuple([], O.propertyType(description), O.propertyType(displayName)),
      }).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "tuple with trailing elements are unsupported",
          },
        },
      }
    `);
  });
  test("array of PropertyTypes - tuple - optional elements", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.tuple(S.optionalElement(O.propertyType(description))),
      }).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "optional tuple elements are unsupported",
          },
        },
      }
    `);
  });

  test("multiple keys - nested PropertyTypes", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          O.propertyType(description),
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
          O.propertyType(displayName),
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
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": {
                "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("multiple keys - array of PropertyTypes", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.array(O.propertyType(description)),
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
          S.array(O.propertyType(displayName)),
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
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
                },
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("multiple keys - mixed", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          O.propertyType(description),
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
          S.array(O.propertyType(displayName)),
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
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": {
                "items": {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
                },
                "type": "array",
              },
            },
            "required": [
              "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
            ],
            "type": "object",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

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

  test("incorrect keys", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        description: O.propertyType(description),
      }).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedPropertyObject",
            "reason": "key is not BaseUrl of PropertyTypeUrl",
          },
        },
      }
    `);
  });
  test("value is not nested or array of nested", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.struct({
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          S.string,
      }).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedPropertyObject",
            "reason": "expected PropertyType as value",
          },
        },
      }
    `);
  });
});

describe("ArrayOfPropertyValues", () => {
  const description = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
    ),
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Description")),
  ).pipe(Effect.runSync);

  const displayName = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
    ),
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Display Name")),
  ).pipe(Effect.runSync);

  test("DataType", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(O.dataType(BuiltIn.Text.v1)).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              ],
            },
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test("PropertyObject", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(
        S.struct({
          "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
            O.propertyType(description),
          "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
            O.propertyType(displayName),
        }),
      ).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "properties": {
                    "https://blockprotocol.org/@blockprotocol/types/property-type/description/": {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
                    },
                    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": {
                      "$ref": "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
                    },
                  },
                  "required": [
                    "https://blockprotocol.org/@blockprotocol/types/property-type/description/",
                    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/",
                  ],
                  "type": "object",
                },
              ],
            },
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("nested", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(S.array(O.dataType(BuiltIn.Text.v1))).pipe(
        S.title("File Properties"),
      ),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "items": {
                    "oneOf": [
                      {
                        "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                      },
                    ],
                  },
                  "type": "array",
                },
              ],
            },
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("nested - maxItems", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(S.array(O.dataType(BuiltIn.Text.v1)).pipe(S.maxItems(1))).pipe(
        S.maxItems(2),
        S.title("File Properties"),
      ),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "description": "an array of at most 2 items",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "items": {
                    "oneOf": [
                      {
                        "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                      },
                    ],
                  },
                  "maxItems": 1,
                  "type": "array",
                },
              ],
            },
            "maxItems": 2,
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test("optional", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(S.union(O.dataType(BuiltIn.Text.v1), S.undefined)).pipe(
        S.title("File Properties"),
      ),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "UnableToEncode",
            "node": {
              "_tag": "UndefinedKeyword",
              "annotations": {
                "Symbol(@effect/schema/annotation/Title)": "undefined",
              },
            },
          },
        },
      }
    `);
  });
  test("minItems", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(O.dataType(BuiltIn.Text.v1)).pipe(
        S.minItems(2),
        S.title("File Properties"),
      ),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "description": "an array of at least 2 items",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              ],
            },
            "minItems": 2,
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("maxItems", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(O.dataType(BuiltIn.Text.v1)).pipe(
        S.maxItems(2),
        S.title("File Properties"),
      ),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "description": "an array of at most 2 items",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              ],
            },
            "maxItems": 2,
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("tuple", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.tuple(O.dataType(BuiltIn.Text.v1), O.dataType(BuiltIn.Text.v1)).pipe(
        S.title("File Properties"),
      ),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              ],
            },
            "maxItems": 2,
            "minItems": 2,
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });
  test("tuple - heterogeneous", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.tuple(O.dataType(BuiltIn.Text.v1), O.dataType(BuiltIn.Number.v1)).pipe(
        S.title("File Properties"),
      ),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "tuple elements must be the same",
          },
        },
      }
    `);
  });
  test("tuple - trailing elements", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.tuple(
        [],
        O.dataType(BuiltIn.Text.v1),
        O.dataType(BuiltIn.Text.v1),
      ).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "tuple with trailing elements are unsupported",
          },
        },
      }
    `);
  });
  test("tuple - optional elements", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.tuple(S.optionalElement(O.dataType(BuiltIn.Text.v1))).pipe(
        S.title("File Properties"),
      ),
    );

    const error = runError(fileProperties);
    expect(error).toMatchInlineSnapshot(`
      {
        "_id": "Cause",
        "_tag": "Fail",
        "failure": {
          "_tag": "@blockprotocol/graph/PropertyType/EncodeError",
          "reason": {
            "_tag": "MalformedArray",
            "reason": "optional tuple elements are unsupported",
          },
        },
      }
    `);
  });

  test("mixed", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(
        S.union(
          O.dataType(BuiltIn.Text.v1),
          S.struct({
            "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
              O.propertyType(description),
          }),
        ),
      ).pipe(S.title("File Properties")),
    ).pipe(Effect.runSync);

    const schema = Effect.runSync(PropertyType.toSchema(fileProperties));
    expect(schema).toMatchInlineSnapshot(`
      {
        "$id": "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
        "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
        "kind": "propertyType",
        "oneOf": [
          {
            "items": {
              "oneOf": [
                {
                  "$ref": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
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
            },
            "type": "array",
          },
        ],
        "title": "File Properties",
      }
    `);
  });

  test("inner not PropertyValues", () => {
    const fileProperties = PropertyType.make(
      PropertyTypeUrl.parseOrThrow(
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
      ),
      S.array(S.string).pipe(S.title("File Properties")),
    );

    const error = runError(fileProperties);
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
                "Symbol(@effect/schema/annotation/Description)": "a string",
                "Symbol(@effect/schema/annotation/Title)": "string",
              },
            },
          },
        },
      }
    `);
  });
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

describe("O.propertyObject", () => {
  const description = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1",
    ),
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Description")),
  ).pipe(Effect.runSync);

  const displayName = PropertyType.make(
    PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
    ),
    BuiltIn.Text.v1.pipe(O.dataType, S.title("Display Name")),
  ).pipe(Effect.runSync);

  test("no children", () => {
    const propertyObject = O.propertyObject();
    const result = S.decodeSync(propertyObject)({});

    expect(result).toMatchInlineSnapshot(`{}`);
  });

  test("single child", () => {
    const propertyObject = O.propertyObject(description);
    const result = S.decodeSync(propertyObject)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        "hello",
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/": "hello",
      }
    `);
  });
  test("multiple children", () => {
    const propertyObject = O.propertyObject(description, displayName);
    const result = S.decodeSync(propertyObject)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        "hello",
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        "world",
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/": "hello",
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": "world",
      }
    `);
  });
  test("array single child", () => {
    const propertyObject = O.propertyObject(O.propertyArray(description));
    const result = S.decodeSync(propertyObject)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        ["hello", "world"],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/": [
          "hello",
          "world",
        ],
      }
    `);
  });
  test("array multiple children", () => {
    const propertyObject = O.propertyObject(
      O.propertyArray(description),
      O.propertyArray(displayName),
    );
    const result = S.decodeSync(propertyObject)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        ["hello", "world"],
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        ["foo", "bar"],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/": [
          "hello",
          "world",
        ],
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": [
          "foo",
          "bar",
        ],
      }
    `);
  });
  test("mixed", () => {
    const propertyObject = O.propertyObject(
      description,
      O.propertyArray(displayName),
    );
    const result = S.decodeSync(propertyObject)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
        "hello",
      "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
        ["foo", "bar"],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/": "hello",
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": [
          "foo",
          "bar",
        ],
      }
    `);
  });
  test("suspend", () => {
    const filePropertiesUrl = PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
    );

    type FileProperties =
      | {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": FileProperties;
        }
      | string;

    const filePropertiesLazy: LazyPropertyType<
      FileProperties,
      FileProperties,
      typeof filePropertiesUrl
    > = PropertyType.makeLazy(
      filePropertiesUrl,
      S.union(
        O.propertyObject({
          id: filePropertiesUrl,
          fn: () => filePropertiesLazy,
        }),
        O.dataType(BuiltIn.Text.v1),
      ).pipe(S.title("File Properties")),
    );
    const fileProperties = Effect.runSync(
      PropertyType.validateLazy(filePropertiesLazy),
    );

    const result = S.decodeSync(fileProperties.schema)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
        {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
            "hello",
        },
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": "hello",
        },
      }
    `);
  });
  test("suspend array", () => {
    const filePropertiesUrl = PropertyTypeUrl.parseOrThrow(
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
    );

    type FileProperties =
      | {
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": readonly FileProperties[];
        }
      | string;

    const filePropertiesLazy: LazyPropertyType<
      FileProperties,
      FileProperties,
      typeof filePropertiesUrl
    > = PropertyType.makeLazy(
      filePropertiesUrl,
      S.union(
        O.propertyObject(
          O.propertyArray({
            id: filePropertiesUrl,
            fn: () => filePropertiesLazy,
          }),
        ),
        O.dataType(BuiltIn.Text.v1),
      ).pipe(S.title("File Properties")),
    );

    const fileProperties = Effect.runSync(
      PropertyType.validateLazy(filePropertiesLazy),
    );

    const result = S.decodeSync(fileProperties.schema)({
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
        [
          {
            "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
              [
                "hello",
                {
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/":
                    ["world"],
                },
              ],
          },
        ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": [
          {
            "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": [
              "hello",
              {
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/": [
                  "world",
                ],
              },
            ],
          },
        ],
      }
    `);
  });
});
