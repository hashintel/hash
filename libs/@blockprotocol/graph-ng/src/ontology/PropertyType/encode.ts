import { AST } from "@effect/schema";
import { Either } from "effect";
import { PropertyTypeSchema } from "./schema.js";
import { EncodeError } from "./error.js";

export function encodeSchema(
  ast: AST.AST,
): Either.Either<PropertyTypeSchema, EncodeError> {
  throw new Error("Not implemented");
}
