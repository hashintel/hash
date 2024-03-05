import * as Object from "../../../src/ontology/builtin/Object";
import * as DataType from "../../../src/ontology/DataType";
import * as ObjectDataType from "../../../src/ontology/internal/ObjectDataType";
import { testAgainstTypes } from "./harness";
import { expect, test } from "vitest";

function requiresObjectType(_: ObjectDataType.ObjectDataType) {}
requiresObjectType(Object.V1);

testAgainstTypes("1", Object.V1, "object");

test("v1: schema", () => {
  expect(DataType.toSchema(Object.V1)).toMatchInlineSnapshot(`
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
