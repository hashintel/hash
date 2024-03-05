import * as Boolean from "../../../src/ontology/builtin/Boolean";
import * as BooleanType from "../../../src/ontology/internal/BooleanType";
import { testAgainstTypes } from "./harness";

function requiresBooleanType(_: BooleanType.BooleanType) {}
requiresBooleanType(Boolean.V1);

testAgainstTypes("1", Boolean.V1, "boolean");
