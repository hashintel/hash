import { once } from "node:events";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { Response as ExpressResponse } from "express";

/** Write one canonical optimization event as NDJSON with backpressure. */
export const writeOptimizationEvent = async (
  response: ExpressResponse,
  event: PetrinautOptimizationEvent,
  signal: AbortSignal,
): Promise<void> => {
  // This is schema-validated NDJSON served with `nosniff`, never HTML.
  // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
  if (response.write(`${JSON.stringify(event)}\n`)) {
    return;
  }
  if (response.destroyed || response.writableEnded) {
    throw new Error("The optimization client disconnected");
  }
  if (signal.aborted) {
    throw new Error("The optimization request was aborted");
  }
  // Aborting this controller removes whichever listeners lost the race, so a
  // backpressured stream cannot accumulate `drain`/`close` listeners and the
  // loser can never surface a late unhandled rejection.
  const waitCleanup = new AbortController();
  try {
    await Promise.race([
      once(response, "drain", { signal: waitCleanup.signal }),
      once(response, "close", { signal: waitCleanup.signal }).then(() => {
        throw new Error("The optimization client disconnected");
      }),
      once(signal, "abort", { signal: waitCleanup.signal }).then(() => {
        throw new Error("The optimization request was aborted");
      }),
    ]);
  } finally {
    waitCleanup.abort();
  }
};

/**
 * Write a final event without waiting for backpressure to clear.
 *
 * Teardown must never block on a stalled client, so this write is
 * best-effort: the response ends immediately afterwards either way.
 */
export const writeTerminalOptimizationEventBestEffort = (
  response: ExpressResponse,
  event: PetrinautOptimizationEvent,
): void => {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  // This is schema-validated NDJSON served with `nosniff`, never HTML.
  // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
  response.write(`${JSON.stringify(event)}\n`);
};

/** Forward canonical optimization events as NDJSON. */
export const forwardOptimizationEvents = async (
  events: AsyncIterable<PetrinautOptimizationEvent>,
  response: ExpressResponse,
  markTerminalEvent: () => void,
  signal: AbortSignal,
): Promise<void> => {
  for await (const event of events) {
    const backpressureWait = writeOptimizationEvent(response, event, signal);
    if (
      event.type === "complete" ||
      (event.type === "error" && event.code !== "attachment_superseded")
    ) {
      // The write is committed synchronously even when the buffer is full,
      // so the stream contains its terminal event regardless of how the
      // backpressure wait settles — an abort must not append a second one.
      // A superseded attachment's error is terminal for the ATTACHMENT
      // only: the run lives on under the newer consumer, so its ownership
      // entry must not be released.
      markTerminalEvent();
    }
    await backpressureWait;
  }
};
