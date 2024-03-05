import * as Number from "../../../src/ontology/builtin/Number";
import * as DataType from "../../../src/ontology/DataType";
import * as NumberDataType from "../../../src/ontology/internal/NumberDataType";
import { testAgainstTypes } from "./harness";
import { expect, test } from "vitest";

function requiresNumberType(_: NumberDataType.NumberDataType) {}
requiresNumberType(Number.V1);

testAgainstTypes("1", Number.V1, "number");

test("v1: schema", () => {
  expect(DataType.toSchema(Number.V1)).toMatchInlineSnapshot(`
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
