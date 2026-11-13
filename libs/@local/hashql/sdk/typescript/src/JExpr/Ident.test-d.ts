import { describe, expectTypeOf, test } from "vitest";

import type * as Ident from "./Ident.js";

/** The schema remains the authority for identifier fields. */
type SchemaIdent = (typeof Ident.Schema)["Type"];

describe("identifier_types", () => {
  test("schema_type", () => {
    expectTypeOf<Ident.Ident>().toEqualTypeOf<SchemaIdent>();
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
