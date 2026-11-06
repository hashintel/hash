import type * as AST from "../AST/index.js";
import type * as DocumentationError from "../DocumentationError.js";
import type { Cause } from "effect";

export type Failure =
  | Cause.UnknownError
  | AST.ParseError.ParseError
  | DocumentationError.DocumentationError;
export type LocalTarget = Extract<
  AST.Reference.Reference.Target,
  { readonly _tag: "Local" }
>["node"];
