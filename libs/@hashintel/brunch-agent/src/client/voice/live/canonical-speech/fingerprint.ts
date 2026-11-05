export const hashCanonicalSpeechText = (text: string): string => {
  let hash = 0x81_1c_9d_c5;
  for (const byte of new TextEncoder().encode(text)) {
    // eslint-disable-next-line no-bitwise -- FNV-1a requires byte-wise XOR.
    hash = Math.imul(hash ^ byte, 0x01_00_01_93);
  }
  // eslint-disable-next-line no-bitwise -- Convert the signed result to uint32.
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
