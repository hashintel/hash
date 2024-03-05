import * as EmptyList from "../../../src/ontology/builtin/EmptyList";
import * as ArrayType from "../../../src/ontology/internal/ArrayType";
import { testAgainstTypes } from "./harness";

function requiresArrayType(_: ArrayType.ArrayType) {}
requiresArrayType(EmptyList.V1);

testAgainstTypes("1", EmptyList.V1, "emptyList");
