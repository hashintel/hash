import * as Number from "../../../src/ontology/builtin/Number";
import * as NumberType from "../../../src/ontology/internal/NumberType";
import { testAgainstTypes } from "./harness";

function requiresNumberType(_: NumberType.NumberType) {}
requiresNumberType(Number.V1);

testAgainstTypes("1", Number.V1, "number");
