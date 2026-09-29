import { describe, expect, expectTypeOf, it } from "vitest";

import { CborDecoder, CborDecoderError } from "./cbor-decoder";
import { cborBstr } from "./fixtures";
import { GenerationId, GenerationIdError, Visitor } from "./generation-id";
import * as Result from "./result";

const identityBytes = (): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, index) => index);

/** Narrows a Result to its Err and returns the error. */
const expectErr = <E>(result: Result.Result<unknown, E>): E => {
  expect(result._tag).toBe("err");
  if (!Result.isErr(result)) {
    throw new Error("expected an Err");
  }
  return result.error;
};

/** Narrows a Result to its Ok and returns the value. */
const expectOk = <T>(result: Result.Result<T, unknown>): T => {
  expect(result._tag).toBe("ok");
  if (!Result.isOk(result)) {
    throw new Error("expected an Ok");
  }
  return result.value;
};

describe("GenerationId.make", () => {
  it("private_constructor", () => {
    expectTypeOf<typeof GenerationId>().not.toMatchTypeOf<
      new (bytes: Uint8Array) => unknown
    >();
  });

  it("borrowed_identity", () => {
    const bytes = identityBytes();
    const generation = expectOk(GenerationId.make(bytes));
    expect(generation.bytes).toBe(bytes);
  });

  it.each([0, 16, 31, 33, 64])("invalid_width_%i", (byteLength) => {
    const error = expectErr(GenerationId.make(new Uint8Array(byteLength)));
    expect(error).toBeInstanceOf(GenerationIdError);
    expect(error.reason).toEqual({
      _tag: "invalid-length",
      byteLength,
    });
  });
});

describe("GenerationId hexadecimal conversion", () => {
  const hex =
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

  it("hex_roundtrip", () => {
    const generation = expectOk(GenerationId.fromHex(hex));
    expect(generation.bytes).toEqual(identityBytes());
    expect(generation.toString()).toBe(hex);
  });

  it("leading_zeroes", () => {
    expect(expectOk(GenerationId.make(new Uint8Array(32))).toString()).toBe(
      "0".repeat(64),
    );
    const maximum = "f".repeat(64);
    expect(expectOk(GenerationId.fromHex(maximum)).bytes).toEqual(
      new Uint8Array(32).fill(0xff),
    );
  });

  it("borrowed_subview", () => {
    const bytes = new Uint8Array(80).fill(0xff);
    bytes.set(identityBytes(), 3);
    expect(expectOk(GenerationId.make(bytes.subarray(3, 35))).toString()).toBe(
      hex,
    );
  });

  it("distinct_parse_storage", () => {
    const first = expectOk(GenerationId.fromHex(hex));
    const second = expectOk(GenerationId.fromHex(hex));
    expect(first.bytes.buffer).not.toBe(second.bytes.buffer);
  });

  it.each([
    "",
    "0".repeat(63),
    "0".repeat(65),
    `0x${"0".repeat(64)}`,
    `g${"0".repeat(63)}`,
    hex.toUpperCase(),
    ` ${hex}`,
    `${hex}\n`,
    "０".repeat(64),
  ])("noncanonical_hex_%j", (value) => {
    expect(expectErr(GenerationId.fromHex(value)).reason).toEqual({
      _tag: "invalid-hex",
    });
  });
});

describe("GenerationId.equals", () => {
  it("separate_storage", () => {
    const generation = expectOk(GenerationId.make(identityBytes()));
    const parsed = expectOk(GenerationId.fromHex(generation.toString()));
    expect(generation.bytes.buffer).not.toBe(parsed.bytes.buffer);
    expect(generation.equals(parsed)).toBe(true);
    expect(parsed.equals(generation)).toBe(true);
    expect(generation.equals(generation)).toBe(true);
  });

  it("subview", () => {
    const backing = new Uint8Array(80).fill(255);
    backing.set(identityBytes(), 37);
    const generation = expectOk(GenerationId.make(backing.subarray(37, 69)));
    expect(
      generation.equals(expectOk(GenerationId.make(identityBytes()))),
    ).toBe(true);
  });

  it.each([0, 15, 31])("different_byte_%i", (index) => {
    const bytes = identityBytes();
    bytes[index] = 255;
    const generation = expectOk(GenerationId.make(bytes));
    const other = expectOk(GenerationId.make(identityBytes()));
    expect(generation.equals(other)).toBe(false);
    expect(other.equals(generation)).toBe(false);
  });
});

describe("GenerationId.Visitor", () => {
  it("byte_string", () => {
    const bytes = identityBytes();
    const payload = Uint8Array.from(cborBstr([...bytes]));
    const result = new CborDecoder(payload).decode(Visitor);

    const generation = expectOk(result);
    expect(generation).toBeInstanceOf(GenerationId);
    expect([...generation.bytes]).toEqual([...bytes]);
  });

  it("borrowed_bytes", () => {
    const bytes = identityBytes();
    const payload = Uint8Array.from(cborBstr([...bytes]));
    const generation = expectOk(new CborDecoder(payload).decode(Visitor));

    // The byte string view is not copied: it shares the payload's buffer.
    expect(generation.bytes.buffer).toBe(payload.buffer);
  });

  it("invalid_width", () => {
    const payload = Uint8Array.from(cborBstr([1, 2, 3]));
    const result = new CborDecoder(payload).decode(Visitor);

    const error = expectErr(result);
    expect(error).toBeInstanceOf(GenerationIdError);
    expect(error.reason).toEqual({ _tag: "invalid-length", byteLength: 3 });
  });

  it("unexpected_kind", () => {
    // 0x01 is the unsigned integer 1, a category Visitor does not accept.
    const result = new CborDecoder(Uint8Array.of(0x01)).decode(Visitor);

    const error = expectErr(result);
    expect(error).toBeInstanceOf(CborDecoderError);
    if (error instanceof CborDecoderError) {
      expect(error.reason).toEqual({
        _tag: "unexpected-kind",
        expected: "a 32-byte generation identity",
        actual: "unsigned-integer",
      });
    }
  });
});
