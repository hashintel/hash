import * as Object from "../../../src/ontology/builtin/Object";
import * as ObjectType from "../../../src/ontology/internal/ObjectType";
import { testAgainstTypes } from "./harness";

function requiresObjectType(_: ObjectType.ObjectType) {}
requiresObjectType(Object.V1);

testAgainstTypes("1", Object.V1, "object");
