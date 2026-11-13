import { describe, expectTypeOf, test } from "vitest";

import type * as Grammar from "../internal/ident-parser.js";
import type * as Ident from "./Ident.js";
import type * as JExpr from "./index.js";

/** The schema remains the authority for identifier fields. */
type SchemaIdent = (typeof Ident.Schema)["Type"];

describe("identifier_types", () => {
  test("encoded_views", () => {
    expectTypeOf<
      readonly [
        JExpr.Call.Call.Encoded,
        JExpr.Dict.Dict.Encoded,
        JExpr.Float.Float.Encoded,
        JExpr.Ident.Ident.Encoded,
        JExpr.Identifier.Identifier.Encoded,
        JExpr.Integer.Integer.Encoded,
        JExpr.LabeledArgument.LabeledArgument.Encoded,
        JExpr.List.List.Encoded,
        JExpr.Literal.Literal.Encoded,
        JExpr.Path.Path.Encoded,
        JExpr.Struct.Struct.Encoded,
        JExpr.Tuple.Tuple.Encoded,
        JExpr.Type.Generic.Generic.Encoded,
        JExpr.Type.GenericArgument.GenericArgument.Encoded,
        JExpr.Type.GenericBound.GenericBound.Encoded,
        JExpr.Type.Intersection.Intersection.Encoded,
        JExpr.Type.Reference.Reference.Encoded,
        JExpr.Type.Struct.Struct.Encoded,
        JExpr.Type.Tuple.Tuple.Encoded,
        JExpr.Type.Union.Union.Encoded,
        JExpr.Expression.Encoded,
        JExpr.Type.Type.Encoded,
      ]
    >().toEqualTypeOf<
      readonly [
        (typeof JExpr.Call.Schema)["Encoded"],
        (typeof JExpr.Dict.Schema)["Encoded"],
        (typeof JExpr.Float.Schema)["Encoded"],
        (typeof JExpr.Ident.Schema)["Encoded"],
        (typeof JExpr.Identifier.Schema)["Encoded"],
        (typeof JExpr.Integer.Schema)["Encoded"],
        (typeof JExpr.LabeledArgument.Schema)["Encoded"],
        (typeof JExpr.List.Schema)["Encoded"],
        (typeof JExpr.Literal.Schema)["Encoded"],
        (typeof JExpr.Path.Schema)["Encoded"],
        (typeof JExpr.Struct.Schema)["Encoded"],
        (typeof JExpr.Tuple.Schema)["Encoded"],
        (typeof JExpr.Type.Generic.Schema)["Encoded"],
        (typeof JExpr.Type.GenericArgument.Schema)["Encoded"],
        (typeof JExpr.Type.GenericBound.Schema)["Encoded"],
        (typeof JExpr.Type.Intersection.Schema)["Encoded"],
        (typeof JExpr.Type.Reference.Schema)["Encoded"],
        (typeof JExpr.Type.Struct.Schema)["Encoded"],
        (typeof JExpr.Type.Tuple.Schema)["Encoded"],
        (typeof JExpr.Type.Union.Schema)["Encoded"],
        (typeof JExpr.Schema)["Encoded"],
        (typeof JExpr.Type.Schema)["Encoded"],
      ]
    >();
    expectTypeOf<JExpr.Ident.Ident.Encoded>().toEqualTypeOf<string>();
    expectTypeOf<JExpr.Ident.Ident.Encoded>().not.toEqualTypeOf<JExpr.Ident.Ident>();
  });

  test("schema_type", () => {
    expectTypeOf<Ident.Ident>().toEqualTypeOf<SchemaIdent>();
  });

  test("grammar_variants", () => {
    expectTypeOf<Grammar.Ident.Lexical>().toEqualTypeOf<Ident.Ident.Lexical>();
    expectTypeOf<Grammar.Ident.Symbol>().toEqualTypeOf<Ident.Ident.Symbol>();
    expectTypeOf<Grammar.Ident.BaseUrl>().toEqualTypeOf<Ident.Ident.BaseUrl>();
  });

  test("variant_types", () => {
    expectTypeOf<Ident.Ident.Lexical>().toEqualTypeOf<
      Extract<SchemaIdent, { readonly _tag: "Lexical" }>
    >();
    expectTypeOf<Ident.Ident.Symbol>().toEqualTypeOf<
      Extract<SchemaIdent, { readonly _tag: "Symbol" }>
    >();
    expectTypeOf<Ident.Ident.BaseUrl>().toEqualTypeOf<
      Extract<SchemaIdent, { readonly _tag: "BaseUrl" }>
    >();
  });
});
