import { describe, expect, it } from "vitest";

import {
  DIRECTORY_ENTRY_BYTES,
  PAYLOAD_ALIGNMENT,
  PREFIX_BYTES,
  readEnvelope,
  SaltileWireError,
  type SaltileKind,
} from "./wire";

const kindByte: Record<SaltileKind, number> = {
  tile: 0x54,
  edges: 0x45,
  locate: 0x4c,
};

/**
 * Builds a response: prefix, directory, payloads sequential in slot
 * order (null = absent slot), optional self-delimiting tail.
 */
const response = (
  kind: SaltileKind,
  payloads: (number[] | null)[],
  tail: number[] = [],
): ArrayBuffer => {
  const base = PREFIX_BYTES + payloads.length * DIRECTORY_ENTRY_BYTES;
  const directory = new DataView(
    new ArrayBuffer(payloads.length * DIRECTORY_ENTRY_BYTES),
  );
  const body: number[] = [];
  let cursor = base;
  for (const [slot, payload] of payloads.entries()) {
    if (payload === null) {
      continue;
    }
    directory.setUint32(slot * DIRECTORY_ENTRY_BYTES, cursor, true);
    directory.setUint32(
      slot * DIRECTORY_ENTRY_BYTES + 4,
      cursor + payload.length,
      true,
    );
    body.push(...payload);
    cursor += payload.length;
    while (cursor % PAYLOAD_ALIGNMENT !== 0) {
      body.push(0);
      cursor += 1;
    }
  }
  const prefix = new DataView(new ArrayBuffer(PREFIX_BYTES));
  for (const [index, byte] of [
    0x53,
    0x41,
    0x4c,
    0x54,
    0x49,
    0x4c,
    0x45,
    kindByte[kind],
  ].entries()) {
    prefix.setUint8(index, byte);
  }
  prefix.setUint16(8, 1, true);
  prefix.setUint16(12, payloads.length, true);
  return new Uint8Array([
    ...new Uint8Array(prefix.buffer),
    ...new Uint8Array(directory.buffer),
    ...body,
    ...tail,
  ]).buffer;
};

/** A well-formed 5-slot tile skeleton: HEAD + two columns, MASS and TYPE_MASK absent. */
const tileSkeleton = (): (number[] | null)[] => [
  [0xa0],
  Array.from({ length: 24 }, () => 1),
  Array.from({ length: 12 }, () => 2),
  null,
  null,
];

const failure = (buffer: ArrayBuffer, kind: SaltileKind = "tile"): string => {
  try {
    readEnvelope(buffer, kind);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileWireError);
    return (error as SaltileWireError).message;
  }
  throw new Error("expected the envelope to be rejected");
};

describe("readEnvelope", () => {
  it("locates present slots and marks absent ones null", () => {
    const envelope = readEnvelope(response("tile", tileSkeleton()), "tile");

    expect(envelope.kind).toBe("tile");
    expect(envelope.wireVersion).toBe(1);
    expect(envelope.slots).toHaveLength(5);
    expect(envelope.slots[0]).toEqual({ start: 56, end: 57 });
    expect(envelope.slots[1]).toEqual({ start: 64, end: 88 });
    expect(envelope.slots[2]).toEqual({ start: 88, end: 100 });
    expect(envelope.slots[3]).toBeNull();
    expect(envelope.slots[4]).toBeNull();
    expect(envelope.tailOffset).toBe(104);
  });

  it("keeps every payload 8-aligned across all padding widths", () => {
    for (let length = 1; length <= PAYLOAD_ALIGNMENT; length += 1) {
      const payloads = tileSkeleton();
      payloads[0] = Array.from({ length }, () => 0x01);
      const envelope = readEnvelope(response("tile", payloads), "tile");
      for (const slot of envelope.slots) {
        if (slot !== null) {
          expect(slot.start % PAYLOAD_ALIGNMENT).toBe(0);
        }
      }
    }
  });

  it("distinguishes present-empty from absent", () => {
    const payloads = tileSkeleton();
    payloads[1] = [];
    payloads[2] = [];
    const envelope = readEnvelope(response("tile", payloads), "tile");
    expect(envelope.slots[1]).toEqual({ start: 64, end: 64 });
    expect(envelope.slots[2]).toEqual({ start: 64, end: 64 });
    expect(envelope.slots[3]).toBeNull();
  });

  it("accepts appended slots beyond the v1 table", () => {
    const payloads = [...tileSkeleton(), [9, 9, 9, 9]];
    const envelope = readEnvelope(response("tile", payloads), "tile");
    expect(envelope.slots).toHaveLength(6);
    expect(envelope.slots[5]).not.toBeNull();
  });

  it("reports the tail offset after the last present payload", () => {
    const buffer = response("tile", tileSkeleton(), [0xa0]);
    expect(readEnvelope(buffer, "tile").tailOffset).toBe(104);
    expect(buffer.byteLength).toBe(105);
  });

  it("names the violated check for every envelope rejection", () => {
    const wrongFamily = response("tile", tileSkeleton());
    new Uint8Array(wrongFamily)[0] = 0x58;
    expect(failure(wrongFamily)).toMatch(/SALTILE family/u);

    const unknownKind = response("tile", tileSkeleton());
    new Uint8Array(unknownKind)[7] = 0x51;
    expect(failure(unknownKind)).toMatch(/unknown kind/u);

    expect(failure(response("edges", [[0xa0], null, null, null]))).toMatch(
      /kind is edges; the request expects tile/u,
    );

    const badVersion = response("tile", tileSkeleton());
    new Uint8Array(badVersion)[8] = 9;
    expect(failure(badVersion)).toMatch(/wire version is 9/u);

    const prefixFlags = response("tile", tileSkeleton());
    new Uint8Array(prefixFlags)[10] = 1;
    expect(failure(prefixFlags)).toMatch(/prefix flags/u);

    const reserved = response("tile", tileSkeleton());
    new Uint8Array(reserved)[14] = 1;
    expect(failure(reserved)).toMatch(/reserved bytes/u);

    expect(failure(response("tile", [[0xa0], null, null, null]))).toMatch(
      /slot count 4 is below the tile table size 5/u,
    );

    expect(
      failure(response("tile", [null, [1, 2, 3, 4], null, null, null])),
    ).toMatch(/slot 0 \(HEAD\) must be present/u);

    const gapStart = response("tile", tileSkeleton());
    new DataView(gapStart).setUint32(
      PREFIX_BYTES + DIRECTORY_ENTRY_BYTES,
      72,
      true,
    );
    expect(failure(gapStart)).toMatch(/sequential layout requires 64/u);

    const inverted = response("tile", tileSkeleton());
    new DataView(inverted).setUint32(
      PREFIX_BYTES + DIRECTORY_ENTRY_BYTES + 4,
      32,
      true,
    );
    expect(failure(inverted)).toMatch(/slot 1 ends before it starts/u);

    const overrun = response("tile", tileSkeleton());
    new DataView(overrun).setUint32(
      PREFIX_BYTES + 2 * DIRECTORY_ENTRY_BYTES + 4,
      4096,
      true,
    );
    expect(failure(overrun)).toMatch(/slot 2 extends beyond the response/u);

    const midDirectory = response("tile", tileSkeleton()).slice(
      0,
      PREFIX_BYTES + 6,
    );
    expect(failure(midDirectory)).toMatch(/ends inside the directory/u);

    const dirtyPadding = response("tile", tileSkeleton());
    new Uint8Array(dirtyPadding)[58] = 7;
    expect(failure(dirtyPadding)).toMatch(/padding bytes must be zero/u);

    const midPadding = response("tile", tileSkeleton()).slice(0, 90);
    expect(failure(midPadding)).toMatch(
      /slot 2 extends beyond|ends inside payload padding/u,
    );
  });
});
