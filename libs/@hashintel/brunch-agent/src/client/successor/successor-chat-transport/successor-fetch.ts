import { FlueChatAdmissionError } from "@local/flue-aisdk-transport";

import { SuccessorChatRefusal } from "./successor-chat-refusal";

/** Attempts at a request the server answers 503, the first included. */
const maxAttempts = 4;
/** The wait when a 503 names none in seconds, and the longest one honoured. */
const defaultRetryAfterMs = 1000;
const maxRetryAfterMs = 10_000;

const retryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get("Retry-After") ?? Number.NaN);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, maxRetryAfterMs)
    : defaultRetryAfterMs;
};

const pause = (milliseconds: number, signal: AbortSignal | null | undefined) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/**
 * The `fetch` under the chat transport. A 503 is sent again, unchanged, after
 * its `Retry-After`: a resent message ID follows the submission it first
 * made, so a retry never admits it twice. Then, for a chat `POST`, a 4xx is a
 * `SuccessorChatRefusal`, and a lost connection, another failure or a server
 * that stays busy leaves the admission unconfirmed. A reconnect's `GET` to an
 * unknown conversation finds nothing to follow, as an idle one does.
 */
export const successorFetch =
  (fetch: typeof globalThis.fetch | undefined): typeof globalThis.fetch =>
  async (input, init) => {
    const sendsMessage = init?.method === "POST";
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        // Each attempt follows the answer to the one before.
        // eslint-disable-next-line no-await-in-loop
        response = await (fetch ?? globalThis.fetch)(input, init);
      } catch (error) {
        if (!sendsMessage || isAbortError(error)) throw error;
        throw new FlueChatAdmissionError(
          { kind: "ambiguous" },
          { cause: error },
        );
      }
      if (response.status === 503 && attempt < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        await response.body?.cancel();
        // eslint-disable-next-line no-await-in-loop
        await pause(retryAfterMs(response), init?.signal);
        continue;
      }
      if (!sendsMessage) {
        return response.status === 404
          ? new Response(null, { status: 204 })
          : response;
      }
      if (response.status >= 400 && response.status < 500) {
        // eslint-disable-next-line no-await-in-loop
        throw new SuccessorChatRefusal(response.status, await response.text());
      }
      if (!response.ok) {
        throw new FlueChatAdmissionError(
          { kind: "ambiguous" },
          // eslint-disable-next-line no-await-in-loop
          { cause: new Error(await response.text()) },
        );
      }
      return response;
    }
  };
