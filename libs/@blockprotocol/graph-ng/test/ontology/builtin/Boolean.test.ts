import * as Boolean from "../../../src/ontology/builtin/Boolean";
import * as DataType from "../../../src/ontology/DataType";
import * as BooleanDataType from "../../../src/ontology/internal/BooleanDataType";
import { testAgainstTypes } from "./harness";
import { expect, test } from "vitest";

function requiresBooleanType(_: BooleanDataType.BooleanDataType) {}
requiresBooleanType(Boolean.V1);

testAgainstTypes("1", Boolean.V1, "boolean");

test("v1: schema", () => {
  expect(DataType.toSchema(Boolean.V1)).toMatchInlineSnapshot(`
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
