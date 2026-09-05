interface UiTextPart {
  readonly type: "text";
  readonly text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUiTextPart = (value: unknown): value is UiTextPart =>
  isRecord(value) && value.type === "text" && typeof value.text === "string";

export const validatePersistedHistory = (
  value: unknown,
  expectedText: string,
): number => {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new Error("History response did not contain a messages array.");
  }

  const found = value.messages.some(
    (message) =>
      isRecord(message) &&
      Array.isArray(message.parts) &&
      message.parts.some(
        (part: unknown) =>
          isUiTextPart(part) && part.text.includes(expectedText),
      ),
  );
  if (!found) {
    throw new Error("History did not contain the expected persisted text.");
  }
  return value.messages.length;
};

export interface StreamValidationResult {
  readonly bytes: number;
  readonly chunks: number;
}

export const validateUiMessageStream = async (
  body: ReadableStream<Uint8Array>,
  onFirstChunk: () => void,
): Promise<StreamValidationResult> => {
  const decoder = new TextDecoder();
  let bytes = 0;
  let chunks = 0;
  let encodedStream = "";

  for await (const chunk of body) {
    if (chunks === 0) onFirstChunk();
    chunks += 1;
    bytes += chunk.byteLength;
    encodedStream += decoder.decode(chunk, { stream: true });
  }
  encodedStream += decoder.decode();

  if (chunks === 0) {
    throw new Error("Streamed turn completed without response chunks.");
  }

  let finished = false;
  for (const line of encodedStream.split(/\r?\n/u)) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice("data: ".length);
    if (data === "[DONE]") continue;
    const event = JSON.parse(data) as { readonly type?: unknown };
    if (event.type === "error" || event.type === "abort") {
      throw new Error(`Streamed turn ended with ${event.type}.`);
    }
    if (event.type === "finish") finished = true;
  }

  if (!finished) {
    throw new Error("Streamed turn completed without a finish event.");
  }
  return { bytes, chunks };
};
