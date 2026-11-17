import { expect, it, test } from "@effect/vitest";
import { Arbitrary, Result } from "effect";
import { describe } from "vitest";

import * as Ident from "./Ident.js";

describe("roundtrip", () => {
  it.prop("identifier_grammar", [Ident.arbitrary()], ([ident]) => {
    expect.hasAssertions();

    const compiled = Ident.compile(ident.output);
    const decoded = Ident.decodeResult(compiled).pipe(Result.getOrThrow);

    expect(decoded).toStrictEqual(ident.output);
  });

  it.prop(
    "identifier_schema",
    [Arbitrary.schema(Ident.SchemaFromSelf)],
    ([ident]) => {
      expect.hasAssertions();

      const compiled = Ident.compile(ident);
      const decoded = Ident.decodeResult(compiled).pipe(Result.getOrThrow);

      // Schema generation includes null-prototype records. The codec preserves their fields.
      expect(decoded).toStrictEqual({ ...ident });
    },
  );
});

describe("identifier_grammar", () => {
  test.each(["cafe\u0301", "\u037E", "\u1FEF", "\u{1D15F}"])(
    "source_spelling_%j",
    (source) => {
      expect.hasAssertions();
      const value = Result.getOrThrow(Ident.decodeResult(source));
      expect(value.value).toBe(source);
      expect(
        Result.getOrThrow(Ident.decodeResult(Ident.compile(value))),
      ).toStrictEqual(value);
      expect(Ident.make(value)).toStrictEqual(value);
    },
  );

  test("canonical_name", () => {
    expect.hasAssertions();
    const precomposed = Ident.make({ _tag: "Lexical", value: "\u00E9" });
    const combining = Ident.make({ _tag: "Lexical", value: "e\u0301" });
    expect(Ident.name(combining)).toBe(Ident.name(precomposed));
    expect(Ident.name(combining)).toBe("\u00E9");
    expect(combining.value).toBe("e\u0301");
  });

  test("overlapping_character_classes", () => {
    expect.hasAssertions();
    expect(Result.getOrThrow(Ident.parse("℘"))).toStrictEqual({
      _tag: "Lexical",
      value: "℘",
    });
    expect(Result.getOrThrow(Ident.parse("`℘`"))).toStrictEqual({
      _tag: "Symbol",
      value: "℘",
    });
  });

  test.each([
    "`HTTP://EXAMPLE.COM/`",
    "`https://[::1]/`",
    "`https://example.com/a::b/`",
  ])("url_%j", (source) => {
    expect.hasAssertions();
    expect(Ident.compile(Result.getOrThrow(Ident.decodeResult(source)))).toBe(
      source,
    );
  });

  test.each([
    "_",
    "`abc`",
    "`https://[bad]/`",
    "`https://x:99999/`",
    "`ftp://example.com/`",
    "\uD800",
  ])("invalid_%j", (source) => {
    expect.hasAssertions();
    expect(Result.isFailure(Ident.parse(source))).toBe(true);
  });
});
