import { createHmac } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32 decoder. The accumulator is reduced to the remaining
 * low bits after every emitted byte so it never exceeds 13 bits — this
 * matters because a naive `value = value * 32 + index` accumulator loses
 * precision past 53 bits (JavaScript `Number`) and produces a truncated
 * key whose trailing bytes collapse to zero.
 *
 * Implementation uses arithmetic rather than bitwise operators to match
 * the rest of this module's style (and the project ESLint config which
 * forbids bitwise operators).
 */
const decodeBase32 = (encodedSecret: string): Buffer => {
  const normalizedSecret = encodedSecret
    .replace(/\s/g, "")
    .replace(/=+$/, "")
    .toUpperCase();

  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;

  for (const character of normalizedSecret) {
    const index = base32Alphabet.indexOf(character);

    if (index === -1) {
      throw new Error(`Invalid base32 character '${character}' in TOTP secret`);
    }

    accumulator = accumulator * 32 + index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      const divisor = 2 ** bits;
      bytes.push(Math.floor(accumulator / divisor) % 256);
      accumulator %= divisor;
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

/**
 * If fewer than `bufferMs` remain in the current 30-second TOTP window,
 * wait for the next window so the generated code has enough validity time.
 */
export const waitForFreshTotpWindow = async (bufferMs = 5_000) => {
  const secondsIntoWindow = (Date.now() / 1_000) % 30;
  const msRemaining = (30 - secondsIntoWindow) * 1_000;
  if (msRemaining < bufferMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, msRemaining + 200);
    });
  }
};
