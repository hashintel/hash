import * as Text from "../../../src/ontology/builtin/Text";
import * as StringType from "../../../src/ontology/internal/StringType";
import { testAgainstTypes } from "./harness";

function requiresStringType(_: StringType.StringType) {}
requiresStringType(Text.V1);

testAgainstTypes("1", Text.V1, "string");
