import { describe, expect, test } from "vitest";
import * as DataType from "../../src/ontology/DataType.js";
import * as BuiltIn from "../../src/ontology/DataType/BuiltIn.js";

describe("v1", () => {
  describe("schema", () => {
    test("Boolean", () => {
      expect(DataType.toSchema(BuiltIn.Boolean.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "A True or False value",
          "kind": "dataType",
          "title": "Boolean",
          "type": "boolean",
        }
      `);
    });

    test("EmptyList", () => {
      expect(DataType.toSchema(BuiltIn.EmptyList.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "const": [],
          "description": "An Empty List",
          "kind": "dataType",
          "title": "Empty List",
          "type": "array",
        }
      `);
    });

    test("Null", () => {
      expect(DataType.toSchema(BuiltIn.Null.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/null/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "A placeholder value representing 'nothing'",
          "kind": "dataType",
          "title": "Null",
          "type": "null",
        }
      `);
    });

    test("Number", () => {
      expect(DataType.toSchema(BuiltIn.Number.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "An arithmetical value (in the Real number system)",
          "kind": "dataType",
          "title": "Number",
          "type": "number",
        }
      `);
    });

    test("Opaque", () => {
      expect(DataType.toSchema(BuiltIn.Opaque.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "An opaque, untyped JSON object",
          "kind": "dataType",
          "title": "Object",
          "type": "object",
        }
      `);
    });

    test("Text", () => {
      expect(DataType.toSchema(BuiltIn.Text.v1)).toMatchInlineSnapshot(`
        {
          "$id": "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          "$schema": "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
          "description": "An ordered sequence of characters",
          "kind": "dataType",
          "title": "Text",
          "type": "string",
        }
      `);
    });
  });
});
