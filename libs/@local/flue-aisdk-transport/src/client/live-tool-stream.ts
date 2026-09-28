import {
  parseLiveToolEvent,
  type LiveToolEvent,
} from "../shared/live-tool-event";

type RequestHeaders =
  | Record<string, string>
  | (() => Promise<Record<string, string>> | Record<string, string>);

export type LiveToolStreamOptions = {
  readonly fetch?: typeof globalThis.fetch;
  readonly headers: RequestHeaders;
  readonly onError?: (error: unknown) => void;
};

const dataFromFrame = (frame: string): string | undefined => {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  return data.length === 0 ? undefined : data.join("\n");
};

export const readLiveToolStream = async (input: {
  readonly conversationUrl: string;
  readonly onEvent: (event: LiveToolEvent) => void;
  readonly options: LiveToolStreamOptions;
  readonly signal: AbortSignal;
  readonly submissionId: string;
}): Promise<void> => {
  let conversationUrlEnd = input.conversationUrl.length;
  while (
    conversationUrlEnd > 0 &&
    input.conversationUrl.charAt(conversationUrlEnd - 1) === "/"
  ) {
    conversationUrlEnd -= 1;
  }
  const url = new URL(
    `${input.conversationUrl.slice(0, conversationUrlEnd)}/live`,
  );
  url.searchParams.set("submissionId", input.submissionId);
  const headers =
    typeof input.options.headers === "function"
      ? await input.options.headers()
      : input.options.headers;
  const fetchImplementation =
    input.options.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImplementation(url, {
    headers: { accept: "text/event-stream", ...headers },
    signal: input.signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(
      `The live tool stream request failed with HTTP ${response.status}.`,
    );
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffered = "";
  for (;;) {
    // The SSE body is sequential by definition.
    // eslint-disable-next-line no-await-in-loop
    const chunk = await reader.read();
    if (chunk.done) break;
    buffered = (
      buffered + decoder.decode(chunk.value, { stream: true })
    ).replaceAll("\r\n", "\n");
    let frameBoundary = buffered.indexOf("\n\n");
    while (frameBoundary >= 0) {
      const frame = buffered.slice(0, frameBoundary);
      buffered = buffered.slice(frameBoundary + 2);
      const data = dataFromFrame(frame);
      if (data !== undefined) {
        input.onEvent(parseLiveToolEvent(JSON.parse(data)));
      }
      frameBoundary = buffered.indexOf("\n\n");
    }
    if (buffered.length > 65_536) {
      throw new Error("The live tool stream frame exceeded 64 KiB.");
    }
  }
};
