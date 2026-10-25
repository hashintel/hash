export const unsigned = (input: number): number[] => {
  const bytes: number[] = [];
  let value = input;
  do {
    const digit = value % 128;
    value = Math.floor(value / 128);
    bytes.push(digit + (value > 0 ? 128 : 0));
  } while (value > 0);
  return bytes;
};

export const vector = (items: readonly number[][]): number[] => [
  ...unsigned(items.length),
  ...items.flat(),
];

// Module identifiers are fixed ASCII names; user names resolve to buffer offsets.
export const name = (value: string): number[] => [
  ...unsigned(value.length),
  ...Array.from(value, (character) => character.charCodeAt(0)),
];

export const section = (id: number, bytes: number[]): number[] => [
  id,
  ...unsigned(bytes.length),
  ...bytes,
];

export const constant = (value: number): number[] => {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return [0x44, ...new Uint8Array(buffer)];
};

// Signed LEB128 for the non-negative i32 indices embedded by the compiler.
export const integer = (value: number): number[] => {
  const bytes = unsigned(value);
  if (bytes[bytes.length - 1]! >= 64) {
    bytes[bytes.length - 1]! += 128;
    bytes.push(0);
  }
  return [0x41, ...bytes];
};
