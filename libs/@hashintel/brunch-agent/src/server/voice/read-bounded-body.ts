/**
 * Reads a request body without buffering more than `maxBytes`, including
 * chunked or understated uploads, and cancels stalled uploads via `signal`.
 * Returns `null` when the body is too large; other failures are rethrown.
 */
export const readBoundedBody = async (
  request: Request,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array | null> => {
  if (Number(request.headers.get("content-length")) > maxBytes) return null;
  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  try {
    await request.body?.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          length += chunk.byteLength;
          if (length > maxBytes) throw new Error("Body too large");
          bytes.set(chunk, length - chunk.byteLength);
        },
      }),
      { signal },
    );
  } catch (error) {
    if (length > maxBytes) return null;
    throw error;
  }
  return bytes.subarray(0, length);
};
