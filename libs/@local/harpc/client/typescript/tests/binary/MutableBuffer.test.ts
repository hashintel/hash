import { Either } from "effect";
import { describe, test, expect } from "vitest";

import { MutableBuffer, MutableBytes } from "../../src/binary/index.js";

describe("put", () => {
  test("u8", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putU8(buffer, 0x04).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(new Uint8Array([0x04]));
  });

  test("u16", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putU16(buffer, 0x04_03).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(new Uint8Array([0x04, 0x03]));
  });

  test("u32", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putU32(buffer, 0x04_03_02_01).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(
      new Uint8Array([0x04, 0x03, 0x02, 0x01]),
    );
  });

  test("i8", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putI8(buffer, -0x04).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(new Uint8Array([0xfc]));
  });

  test("i16", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putI16(buffer, -0x04_03).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(new Uint8Array([0xfb, 0xfd]));
  });

  test("i32", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putI32(buffer, -0x04_03_02_01).pipe(Either.getOrThrow);

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(
      new Uint8Array([0xfb, 0xfc, 0xfd, 0xff]),
    );
  });

  test("slice", () => {
    const buffer = MutableBuffer.makeWrite();

    MutableBuffer.putSlice(buffer, new Uint8Array([0x04, 0x03])).pipe(
      Either.getOrThrow,
    );

    const array = MutableBuffer.take(buffer);

    expect(new Uint8Array(array)).toStrictEqual(new Uint8Array([0x04, 0x03]));
  });
});

describe("get", () => {
  const elements: number[] = [];

  // eslint-disable-next-line no-plusplus
  for (let i = 255; i >= 0; i--) {
    elements.push(i);
  }

  const makeBuffer = () =>
    MutableBuffer.makeRead(MutableBytes.from(new Uint8Array(elements).buffer));

  test("u8", () => {
    expect(MutableBuffer.getU8(makeBuffer()).pipe(Either.getOrThrow)).toBe(
      0xff,
    );
  });

  test("u16", () => {
    expect(MutableBuffer.getU16(makeBuffer()).pipe(Either.getOrThrow)).toBe(
      0xff_fe,
    );
  });

  test("u32", () => {
    expect(MutableBuffer.getU32(makeBuffer()).pipe(Either.getOrThrow)).toBe(
      0xff_fe_fd_fc,
    );
  });

  test("i8", () => {
    expect(MutableBuffer.getI8(makeBuffer()).pipe(Either.getOrThrow)).toBe(-1);
  });

  test("i16", () => {
    expect(MutableBuffer.getI16(makeBuffer()).pipe(Either.getOrThrow)).toBe(-2);
  });

  test("i32", () => {
    expect(MutableBuffer.getI32(makeBuffer()).pipe(Either.getOrThrow)).toBe(
      -66052,
    );
  });

  test("slice", () => {
    expect(
      MutableBuffer.getSlice(makeBuffer(), 2).pipe(Either.getOrThrow),
    ).toStrictEqual(new Uint8Array([0xff, 0xfe]));
  });
});
