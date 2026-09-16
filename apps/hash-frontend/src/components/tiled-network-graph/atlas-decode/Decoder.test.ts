import { describe, expect, it } from "vitest";

import { Decoder, DecoderError, type DecoderErrorReason } from "./Decoder";
import { f32le, u32le } from "./fixtures";
import * as Result from "./Result";

/** Little-endian byte builders fixtures.ts does not already provide. */
const u16le = (value: number) => {
  const view = new DataView(new ArrayBuffer(2));
  view.setUint16(0, value, true);
  return new Uint8Array(view.buffer);
};
const u64le = (value: bigint) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, value, true);
  return new Uint8Array(view.buffer);
};
const i8le = (value: number) => Uint8Array.of(value);
const i16le = (value: number) => {
  const view = new DataView(new ArrayBuffer(2));
  view.setInt16(0, value, true);
  return new Uint8Array(view.buffer);
};
const i32le = (value: number) => {
  const view = new DataView(new ArrayBuffer(4));
  view.setInt32(0, value, true);
  return new Uint8Array(view.buffer);
};
const i64le = (value: bigint) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigInt64(0, value, true);
  return new Uint8Array(view.buffer);
};
const f64le = (value: number) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return new Uint8Array(view.buffer);
};

const decoderOf = <T extends ArrayBufferLike>(
  bytes: Uint8Array<T>,
): Decoder<T> =>
  new Decoder(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

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

describe("Decoder scalars", () => {
  it("reads_u8", () => {
    const decoder = decoderOf(Uint8Array.of(0xab));
    expect(expectOk(decoder.nextU8())).toBe(0xab);
    expect(decoder.offset).toBe(1);
  });

  it("reads_u16_little_endian", () => {
    const decoder = decoderOf(u16le(0x1234));
    expect(expectOk(decoder.nextU16())).toBe(0x1234);
    expect(decoder.offset).toBe(2);
  });

  it("reads_u32_little_endian", () => {
    const decoder = decoderOf(Uint8Array.from(u32le([0x12345678])));
    expect(expectOk(decoder.nextU32())).toBe(0x12345678);
    expect(decoder.offset).toBe(4);
  });

  it("reads_u32_high_bit", () => {
    const decoder = decoderOf(Uint8Array.from(u32le([0xffffffff])));
    expect(expectOk(decoder.nextU32())).toBe(0xffffffff);
  });

  it("reads_u64_little_endian", () => {
    const decoder = decoderOf(u64le(0x0102030405060708n));
    expect(expectOk(decoder.nextU64())).toBe(0x0102030405060708n);
    expect(decoder.offset).toBe(8);
  });

  it("reads_i8_negative", () => {
    expect(expectOk(decoderOf(i8le(-1)).nextI8())).toBe(-1);
    expect(expectOk(decoderOf(i8le(-128)).nextI8())).toBe(-128);
  });

  it("reads_i16_negative", () => {
    expect(expectOk(decoderOf(i16le(-1)).nextI16())).toBe(-1);
    expect(expectOk(decoderOf(i16le(-32768)).nextI16())).toBe(-32768);
  });

  it("reads_i32_negative", () => {
    expect(expectOk(decoderOf(i32le(-1)).nextI32())).toBe(-1);
    expect(expectOk(decoderOf(i32le(-2147483648)).nextI32())).toBe(-2147483648);
  });

  it("reads_i64_negative", () => {
    expect(expectOk(decoderOf(i64le(-1n)).nextI64())).toBe(-1n);
    expect(expectOk(decoderOf(i64le(-9223372036854775808n)).nextI64())).toBe(
      -9223372036854775808n,
    );
  });

  it("reads_f32", () => {
    const decoder = decoderOf(Uint8Array.from(f32le([1.5])));
    expect(expectOk(decoder.nextF32())).toBe(1.5);
    expect(decoder.offset).toBe(4);
  });

  it("reads_f64", () => {
    const decoder = decoderOf(f64le(1.5));
    expect(expectOk(decoder.nextF64())).toBe(1.5);
    expect(decoder.offset).toBe(8);
  });

  it("byteLength_offset_remaining", () => {
    const decoder = decoderOf(Uint8Array.from(u32le([1, 2])));
    expect(decoder.byteLength).toBe(8);
    expect(decoder.offset).toBe(0);
    expect(decoder.remaining).toBe(8);
    expectOk(decoder.nextU32());
    expect(decoder.offset).toBe(4);
    expect(decoder.remaining).toBe(4);
  });

  const expectEofWithoutAdvance = (
    result: Result.Result<unknown, unknown>,
    decoder: Decoder<ArrayBuffer>,
    before: number,
  ): void => {
    const error = expectErr(result);
    expect(error).toBeInstanceOf(DecoderError);
    if (error instanceof DecoderError) {
      expect(error.reason._tag).toBe("eof");
    }
    expect(decoder.offset).toBe(before);
  };

  it("eof_u8", () => {
    const decoder = decoderOf(Uint8Array.of());
    expectEofWithoutAdvance(decoder.nextU8(), decoder, 0);
  });

  it("eof_u16", () => {
    const decoder = decoderOf(Uint8Array.of(1));
    expectEofWithoutAdvance(decoder.nextU16(), decoder, 0);
  });

  it("eof_u32", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectEofWithoutAdvance(decoder.nextU32(), decoder, 0);
  });

  it("eof_u64", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3, 4, 5, 6, 7));
    expectEofWithoutAdvance(decoder.nextU64(), decoder, 0);
  });

  it("eof_f32", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectEofWithoutAdvance(decoder.nextF32(), decoder, 0);
  });

  it("eof_f64", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3, 4, 5, 6, 7));
    expectEofWithoutAdvance(decoder.nextF64(), decoder, 0);
  });

  it("eof_u32_after_prior_read", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectOk(decoder.nextU8());
    expectEofWithoutAdvance(decoder.nextU32(), decoder, 1);
  });
});

describe("Decoder byte ranges", () => {
  it("nextUint8Array_borrows_and_advances", () => {
    const backing = Uint8Array.of(0x11, 0x22, 0x33, 0x44);
    const decoder = decoderOf(backing);
    const view = expectOk(decoder.nextUint8Array(3));
    expect([...view]).toEqual([0x11, 0x22, 0x33]);
    expect(view.buffer).toBe(backing.buffer);
    expect(decoder.offset).toBe(3);

    // Mutating the backing buffer is visible through the borrowed view.
    backing[0] = 0x99;
    expect(view[0]).toBe(0x99);
  });

  it("uint8Array_cursor_unmoved", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3, 4, 5));
    expectOk(decoder.nextU8());
    const before = decoder.offset;
    const view = expectOk(decoder.uint8Array(2, 2));
    expect([...view]).toEqual([3, 4]);
    expect(decoder.offset).toBe(before);
  });

  it("subview_bounds_not_backing_buffer", () => {
    const backing = new ArrayBuffer(24);
    new Uint8Array(backing).set(
      [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88],
      4,
    );
    const view = new DataView(backing, 4, 8);
    const decoder = new Decoder(view);

    expect(decoder.byteLength).toBe(8);
    expect(expectOk(decoder.nextU32())).toBe(0x44332211);
    expect(expectOk(decoder.nextU32())).toBe(0x88776655);
    expect(decoder.remaining).toBe(0);

    const error = expectErr(decoder.nextU8());
    expect(error.reason).toEqual({
      _tag: "eof",
      byteLength: 8,
      requestedByteLength: 1,
    });
  });

  it("uint8Array_offset_relative_to_view", () => {
    const backing = new ArrayBuffer(16);
    new Uint8Array(backing).set([0xaa, 0xbb, 0xcc, 0xdd], 8);
    const view = new DataView(backing, 4, 8);
    const decoder = new Decoder(view);

    // Offset 4 within an 8-byte view starting at backing byte 4 reads
    // backing bytes [8, 12).
    const bytes = expectOk(decoder.uint8Array(4, 4));
    expect([...bytes]).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
    expect(bytes.byteOffset).toBe(8);
  });

  it("uint8Array_zero_length_at_end", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expect(expectOk(decoder.uint8Array(3, 0))).toHaveLength(0);
  });

  it.each([
    { name: "negative_offset", offset: -1, length: 1 },
    { name: "fractional_offset", offset: 1.5, length: 1 },
    { name: "nan_offset", offset: Number.NaN, length: 1 },
    { name: "infinite_offset", offset: Number.POSITIVE_INFINITY, length: 1 },
    { name: "negative_length", offset: 0, length: -1 },
    { name: "fractional_length", offset: 0, length: 2.5 },
    {
      name: "unsafe_length",
      offset: 0,
      length: Number.MAX_SAFE_INTEGER + 1,
    },
  ])("invalid_range_$name", ({ offset, length }) => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    const error = expectErr(decoder.uint8Array(offset, length));
    expect(error).toBeInstanceOf(DecoderError);
    expect(error.reason).toEqual({
      _tag: "invalid-range",
      byteOffset: offset,
      byteLength: length,
    } satisfies DecoderErrorReason);
  });

  it("overflowing_length_is_eof", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    const error = expectErr(decoder.uint8Array(0, 100));
    expect(error.reason).toEqual({
      _tag: "eof",
      byteLength: 3,
      requestedByteLength: 100,
    });
  });

  it("overflowing_offset_eof", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    const error = expectErr(decoder.uint8Array(4, 0));
    expect(error.reason._tag).toBe("eof");
  });

  it("cursor_relative_invalid_length_no_advance", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    const before = decoder.offset;
    expectErr(decoder.nextUint8Array(1.5));
    expect(decoder.offset).toBe(before);
  });

  it("cursor_relative_eof_no_advance", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectOk(decoder.nextU8());
    const before = decoder.offset;
    expectErr(decoder.nextUint8Array(100));
    expect(decoder.offset).toBe(before);
  });
});

describe("Decoder seek", () => {
  it("seek_moves_cursor", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3, 4));
    expectOk(decoder.seek(2));
    expect(decoder.offset).toBe(2);
    expect(expectOk(decoder.nextU8())).toBe(3);
  });

  it("seek_to_exact_end", () => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectOk(decoder.seek(3));
    expect(decoder.offset).toBe(3);
    expect(decoder.remaining).toBe(0);
  });

  it.each([
    { name: "negative", offset: -1, tag: "invalid-range" },
    { name: "fractional", offset: 1.5, tag: "invalid-range" },
    { name: "nan", offset: Number.NaN, tag: "invalid-range" },
    { name: "past_end", offset: 5, tag: "eof" },
  ])("rejects_offset_$name", ({ offset, tag }) => {
    const decoder = decoderOf(Uint8Array.of(1, 2, 3));
    expectOk(decoder.seek(1));
    const before = decoder.offset;
    const error = expectErr(decoder.seek(offset));
    expect(error.reason._tag).toBe(tag);
    expect(decoder.offset).toBe(before);
  });
});

describe("Decoder strings", () => {
  it("decodes_ascii", () => {
    const decoder = decoderOf(new TextEncoder().encode("hello"));
    expect(expectOk(decoder.nextString(5))).toBe("hello");
  });

  it("decodes_multibyte_utf8", () => {
    // "c" + U+00E9 ("é") encoded as 0xC3 0xA9.
    const decoder = decoderOf(Uint8Array.of(0x63, 0xc3, 0xa9));
    expect(expectOk(decoder.nextString(3))).toBe("cé");
  });

  it("preserves_leading_bom", () => {
    // U+FEFF (0xEF 0xBB 0xBF) followed by "a".
    const decoder = decoderOf(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61));
    expect(expectOk(decoder.nextString(4))).toBe("\ufeffa");
  });

  it("rejects_invalid_utf8_byte", () => {
    const decoder = decoderOf(Uint8Array.of(0xff));
    const error = expectErr(decoder.nextString(1));
    expect(error.reason).toEqual({ _tag: "invalid-string" });
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("rejects_truncated_multibyte", () => {
    // 0xC3 alone declares a two-byte sequence with no continuation byte.
    const decoder = decoderOf(Uint8Array.of(0xc3));
    const error = expectErr(decoder.nextString(1));
    expect(error.reason._tag).toBe("invalid-string");
  });

  it("invalid_string_advances_cursor", () => {
    // The byte read advances the cursor before UTF-8 decoding.
    const decoder = decoderOf(Uint8Array.of(0xff, 0x00));
    expectErr(decoder.nextString(1));
    expect(decoder.offset).toBe(1);
  });

  it("out_of_range_length_no_advance", () => {
    const decoder = decoderOf(new TextEncoder().encode("hi"));
    const before = decoder.offset;
    const error = expectErr(decoder.nextString(100));
    expect(error.reason._tag).toBe("eof");
    expect(decoder.offset).toBe(before);
  });

  it("decodes_from_seeked_position", () => {
    const decoder = decoderOf(new TextEncoder().encode("xxhello"));
    expectOk(decoder.seek(2));
    expect(expectOk(decoder.nextString(5))).toBe("hello");
  });
});
