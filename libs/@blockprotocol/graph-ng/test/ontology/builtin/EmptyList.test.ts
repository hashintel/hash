import { expect, test } from "vitest";

import * as EmptyList from "../../../src/ontology/builtin/EmptyList";
import * as DataType from "../../../src/ontology/DataType";
import * as ArrayDataType from "../../../src/ontology/internal/ArrayDataType";
import { testAgainstTypes } from "./harness";

function requiresArrayType(_: ArrayDataType.ArrayDataType) {}
requiresArrayType(EmptyList.V1);

testAgainstTypes("1", EmptyList.V1, "emptyList");

test("v1: schema", () => {
  expect(DataType.toSchema(EmptyList.V1)).toMatchInlineSnapshot(`
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
