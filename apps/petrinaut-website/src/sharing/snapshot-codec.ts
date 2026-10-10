import type { BrotliWasmType } from "brotli-wasm";

export const maxSnapshotHashLength = 16_000;
export const maxSnapshotBytes = 2 * 1024 * 1024;
const prefix = "v1.br.";

export type SnapshotErrorCode =
  | "invalid"
  | "unsupported"
  | "too-large"
  | "unavailable";

export class SnapshotError extends Error {
  constructor(public readonly code: SnapshotErrorCode) {
    super(code);
  }
}

export const snapshotErrorMessage = (code: SnapshotErrorCode): string => {
  switch (code) {
    case "invalid":
      return "This snapshot link is incomplete or invalid. Ask the sender to copy it again.";
    case "unsupported":
      return "This snapshot uses a newer link format. Refresh Petrinaut and try again.";
    case "too-large":
      return "This snapshot is too large for a link. Share the downloaded file instead.";
    case "unavailable":
      return "Petrinaut couldn't prepare this snapshot. Please try again.";
  }
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
};

export const compressSnapshot = (
  bytes: Uint8Array,
  brotli: BrotliWasmType,
): string => {
  if (bytes.length > maxSnapshotBytes) throw new SnapshotError("too-large");
  const hash = prefix + toBase64Url(brotli.compress(bytes, { quality: 11 }));
  if (hash.length > maxSnapshotHashLength) throw new SnapshotError("too-large");
  return hash;
};

export const decompressSnapshot = (
  hash: string,
  brotli: BrotliWasmType,
): Uint8Array => {
  if (hash.length > maxSnapshotHashLength) throw new SnapshotError("too-large");
  if (!hash.startsWith(prefix)) {
    throw new SnapshotError(/^v\d+\./u.test(hash) ? "unsupported" : "invalid");
  }
  const encoded = hash.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new SnapshotError("invalid");
  try {
    const binary = atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/"));
    const compressed = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    if (toBase64Url(compressed) !== encoded) throw new SnapshotError("invalid");
    const stream = new brotli.DecompressStream();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let offset = 0;
    try {
      for (;;) {
        const result = stream.decompress(compressed.subarray(offset), 32_768);
        try {
          const chunk = result.buf;
          size += chunk.length;
          if (size > maxSnapshotBytes) throw new SnapshotError("too-large");
          chunks.push(chunk);
          offset += result.input_offset;
          if (result.code === brotli.BrotliStreamResultCode.ResultSuccess) {
            if (offset !== compressed.length)
              throw new SnapshotError("invalid");
            break;
          }
          if (result.code !== brotli.BrotliStreamResultCode.NeedsMoreOutput) {
            throw new SnapshotError("invalid");
          }
        } finally {
          result.free();
        }
      }
    } finally {
      stream.free();
    }
    const output = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
      output.set(chunk, position);
      position += chunk.length;
    }
    return output;
  } catch (error) {
    throw error instanceof SnapshotError ? error : new SnapshotError("invalid");
  }
};
