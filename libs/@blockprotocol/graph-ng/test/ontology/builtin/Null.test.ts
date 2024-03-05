import * as Null from "../../../src/ontology/builtin/Null";
import * as DataType from "../../../src/ontology/DataType";
import * as NullDataType from "../../../src/ontology/internal/NullDataType";
import { testAgainstTypes } from "./harness";
import { expect, test } from "vitest";

function requiresNullType(_: NullDataType.NullDataType) {}
requiresNullType(Null.V1);

testAgainstTypes("1", Null.V1, "null");

test("v1: schema", () => {
  expect(DataType.toSchema(Null.V1)).toMatchInlineSnapshot(`
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
