import { expect, test } from "vitest";

import * as Text from "../../../src/ontology/builtin/Text";
import * as DataType from "../../../src/ontology/DataType";
import * as StringDataType from "../../../src/ontology/internal/StringDataType";
import { testAgainstTypes } from "./harness";

function requiresStringType(_: StringDataType.StringDataType) {}
requiresStringType(Text.V1);

testAgainstTypes("1", Text.V1, "string");

test("v1: schema", () => {
  expect(DataType.toSchema(Text.V1)).toMatchInlineSnapshot(`
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
