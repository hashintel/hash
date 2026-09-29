import { describe, expect, it } from "vitest";

import * as CborDecoder from "./cbor-decoder";
import * as CborPrimitive from "./cbor-primitive";
import * as Result from "./result";

/** A text visitor whose prototype method requires its original receiver. */
class PrefixedText implements CborDecoder.CborVisitor<string, never> {
  readonly expecting = "prefixed text";
  readonly #prefix: string;

  /** Sets the prefix applied to decoded text. */
  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  /** Applies the prefix held in private state. */
  visitTextString(value: string): Result.Result<string, never> {
    return Result.ok(this.#prefix + value);
  }
}

describe("CborPrimitive.ignore", () => {
  it("nested_values", () => {
    const bytes = Uint8Array.of(
      0x8a,
      0x01,
      0x20,
      0x41,
      0x00,
      0x61,
      0x78,
      0xf4,
      0xf6,
      0xfa,
      0x3f,
      0x80,
      0x00,
      0x00,
      0xfb,
      0x3f,
      0xf0,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x81,
      0x80,
      0xa1,
      0x00,
      0x81,
      0xf6,
    );
    expect(
      new CborDecoder.CborDecoder(bytes).decode(CborPrimitive.ignore),
    ).toMatchObject({ _tag: "ok", value: undefined });
  });

  it.each([
    [0x81, 0x18, 0x01],
    [0xa2, 0x00, 0xf6, 0x00, 0xf6],
    [0x61, 0xff],
    [0x81],
  ])("invalid_nested_value_%j", (...bytes) => {
    expect(
      Result.isErr(
        new CborDecoder.CborDecoder(Uint8Array.from(bytes)).decode(
          CborPrimitive.ignore,
        ),
      ),
    ).toBe(true);
  });
});

describe("CborPrimitive.nullable", () => {
  it("prototype_receiver", () => {
    const element = new PrefixedText("label:");
    expect(Object.hasOwn(element, "visitTextString")).toBe(false);
    const visitor = CborPrimitive.nullable(element);
    expect(
      new CborDecoder.CborDecoder(Uint8Array.of(0x61, 0x78)).decode(visitor),
    ).toMatchObject({ _tag: "ok", value: "label:x" });
  });

  it("explicit_null", () => {
    const visitor = CborPrimitive.nullable(new PrefixedText("label:"));
    expect(
      new CborDecoder.CborDecoder(Uint8Array.of(0xf6)).decode(visitor),
    ).toMatchObject({ _tag: "ok", value: null });
  });

  it("unsupported_category", () => {
    const visitor = CborPrimitive.nullable(new PrefixedText("label:"));
    expect(visitor).not.toHaveProperty("visitUnsignedInteger");
    expect(
      new CborDecoder.CborDecoder(Uint8Array.of(0x01)).decode(visitor),
    ).toMatchObject({
      _tag: "err",
      error: {
        reason: {
          _tag: "unexpected-kind",
          actual: "unsigned-integer",
          expected: "prefixed text or null",
        },
      },
    });
  });

  it("spread_adapter", () => {
    const visitor = {
      ...CborPrimitive.nullable(new PrefixedText("label:")),
      expecting: "a label or null",
    };
    expect(
      new CborDecoder.CborDecoder(Uint8Array.of(0x61, 0x78)).decode(visitor),
    ).toMatchObject({ _tag: "ok", value: "label:x" });
  });

  it("domain_error", () => {
    const error = new Error("rejected text");
    const visitor = CborPrimitive.nullable({
      expecting: "accepted text",
      visitTextString: () => Result.err(error),
    });
    const result = new CborDecoder.CborDecoder(
      Uint8Array.of(0x61, 0x78),
    ).decode(visitor);
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error).toBe(error);
    }
  });
});
