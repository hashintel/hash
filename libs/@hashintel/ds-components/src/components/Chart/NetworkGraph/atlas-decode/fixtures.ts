/**
 * Reference byte builders for SALTILE fixtures: hand-built responses
 * for decoder tests, and the shape the checked-in goldens grow from.
 * Test support - not exported from the package surface.
 *
 * CBOR integers and floats are big-endian per RFC 8949; envelope
 * integers and column payloads are little-endian per the wire.
 */

import {
  DIRECTORY_ENTRY_BYTES,
  PAYLOAD_ALIGNMENT,
  PREFIX_BYTES,
  type SaltileKind,
} from "./wire";

export const cborUint = (value: number, major = 0): number[] => {
  const base = major * 32;
  if (value < 24) {
    return [base + value];
  }
  if (value <= 0xff) {
    return [base + 24, value];
  }
  const wide = new DataView(new ArrayBuffer(2));
  wide.setUint16(0, value, false);
  return [base + 25, ...new Uint8Array(wide.buffer)];
};

export const cborBstr = (bytes: number[]): number[] => [
  ...cborUint(bytes.length, 2),
  ...bytes,
];

export const cborTstr = (text: string): number[] => {
  const encoded = [...new TextEncoder().encode(text)];
  return [...cborUint(encoded.length, 3), ...encoded];
};

export const cborArray = (entries: number[][]): number[] => [
  ...cborUint(entries.length, 4),
  ...entries.flat(),
];

export const cborMap = (entries: [number, number[]][]): number[] => [
  ...cborUint(entries.length, 5),
  ...entries.flatMap(([key, value]) => [...cborUint(key), ...value]),
];

export const cborNull = (): number[] => [0xf6];

export const cborBool = (value: boolean): number[] => [value ? 0xf5 : 0xf4];

export const cborF32 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  return [0xfa, ...new Uint8Array(view.buffer)];
};

export const f32le = (values: number[]): number[] => {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  for (const [index, value] of values.entries()) {
    view.setFloat32(index * 4, value, true);
  }
  return [...new Uint8Array(view.buffer)];
};

export const u32le = (values: number[]): number[] => {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  for (const [index, value] of values.entries()) {
    view.setUint32(index * 4, value, true);
  }
  return [...new Uint8Array(view.buffer)];
};

const kindBytes: Record<SaltileKind, number> = {
  tile: 0x54,
  edges: 0x45,
  locate: 0x4c,
};

/**
 * Builds one response: prefix, offset directory, payloads sequential
 * in slot order (null = absent slot), optional self-delimiting tail.
 */
export const buildResponse = (
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
    kindBytes[kind],
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
