import { createHmac } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const decodeBase32 = (encodedSecret: string): Buffer => {
  const normalizedSecret = encodedSecret
    .replace(/\s/g, "")
    .replace(/=+$/, "")
    .toUpperCase();

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalizedSecret) {
    const index = base32Alphabet.indexOf(character);

    if (index === -1) {
      continue;
    }

    value = value * 32 + index;
    bits += 5;

    if (bits >= 8) {
      bytes.push(Math.floor(value / 2 ** (bits - 8)) % 256);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

export const generateTotpCode = (
  secret: string,
  timestamp: number = Date.now(),
): string => {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 1_000 / 30);
  const counterBuffer = Buffer.alloc(8);
  const highCounter = Math.floor(counter / 2 ** 32);
  const lowCounter = counter % 2 ** 32;

  counterBuffer.writeUInt32BE(highCounter, 0);
  counterBuffer.writeUInt32BE(lowCounter, 4);

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! % 16;

  const binaryCode =
    (hmac[offset]! % 128) * 16_777_216 +
    hmac[offset + 1]! * 65_536 +
    hmac[offset + 2]! * 256 +
    hmac[offset + 3]!;

  return (binaryCode % 1_000_000).toString().padStart(6, "0");
};
