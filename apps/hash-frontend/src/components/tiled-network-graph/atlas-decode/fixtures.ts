/**
 * Byte builders for decoder tests.
 *
 * CBOR integers and floats are big-endian. Envelope fields and column payloads are little-endian.
 */

import * as Envelope from "./Envelope";

export const cborUint = (value: number | bigint, major = 0): number[] => {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(
      "use bigint for a CBOR magnitude outside safe integer range",
    );
  }
  const integer = BigInt(value);
  if (integer < 0n || integer > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("CBOR integer magnitude must fit u64");
  }

  const base = major * 32;
  if (integer < 24n) {
    return [base + Number(integer)];
  }
  if (integer <= 0xffn) {
    return [base + 24, Number(integer)];
  }
  if (integer <= 0xffffn) {
    const bytes = new DataView(new ArrayBuffer(2));
    bytes.setUint16(0, Number(integer), false);
    return [base + 25, ...new Uint8Array(bytes.buffer)];
  }
  if (integer <= 0xffff_ffffn) {
    const bytes = new DataView(new ArrayBuffer(4));
    bytes.setUint32(0, Number(integer), false);
    return [base + 26, ...new Uint8Array(bytes.buffer)];
  }
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setBigUint64(0, integer, false);
  return [base + 27, ...new Uint8Array(bytes.buffer)];
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

const kinds = {
  tile: "SALTILET",
  edges: "SALTILEE",
  locate: "SALTILEL",
} as const satisfies Record<string, Envelope.Envelope["kind"]>;

/**
 * Builds one response: prefix, offset directory, payloads sequential
 * in slot order (null = absent slot), optional self-delimiting tail.
 */
export const buildResponse = (
  kind: keyof typeof kinds,
  payloads: (number[] | null)[],
  tail: number[] = [],
): ArrayBuffer => {
  const base =
    Envelope.PREFIX_BYTES + payloads.length * Envelope.DIRECTORY_ENTRY_BYTES;
  const directory = new DataView(
    new ArrayBuffer(payloads.length * Envelope.DIRECTORY_ENTRY_BYTES),
  );
  const body: number[] = [];
  let cursor = base;
  for (const [slot, payload] of payloads.entries()) {
    if (payload === null) {
      continue;
    }
    directory.setUint32(slot * Envelope.DIRECTORY_ENTRY_BYTES, cursor, true);
    directory.setUint32(
      slot * Envelope.DIRECTORY_ENTRY_BYTES + 4,
      cursor + payload.length,
      true,
    );
    body.push(...payload);
    cursor += payload.length;
    while (cursor % Envelope.PAYLOAD_ALIGNMENT !== 0) {
      body.push(0);
      cursor += 1;
    }
  }
  const prefix = new DataView(new ArrayBuffer(Envelope.PREFIX_BYTES));
  for (const [index, character] of [...kinds[kind]].entries()) {
    prefix.setUint8(index, character.charCodeAt(0));
  }
  prefix.setUint16(8, Envelope.SALTILE_WIRE_VERSION, true);
  prefix.setUint16(12, payloads.length, true);
  return new Uint8Array([
    ...new Uint8Array(prefix.buffer),
    ...new Uint8Array(directory.buffer),
    ...body,
    ...tail,
  ]).buffer;
};
