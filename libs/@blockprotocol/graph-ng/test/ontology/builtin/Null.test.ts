import * as Null from "../../../src/ontology/builtin/Null";
import * as NullType from "../../../src/ontology/internal/NullType";
import { testAgainstTypes } from "./harness";

function requiresNullType(_: NullType.NullType) {}
requiresNullType(Null.V1);

testAgainstTypes("1", Null.V1, "null");
