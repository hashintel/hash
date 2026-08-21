import { decodePetrinautOptimizerStream } from "./decode-optimization-stream.js";
import {
  petrinautOptimizerHttpErrorFromResponse,
  petrinautOptimizerUrl,
} from "./optimizer-http.js";

import type { PetrinautOptimizerFetch } from "./optimizer-http.js";
import type {
  AbortSignalLike,
  PetrinautOptimizationEvent,
} from "@hashintel/petrinaut-core";

/** One opened optimization event stream plus its upstream correlation id. */
export type PetrinautOptimizationStreamHandle = {
  /** Canonical optimization events decoded from the upstream stream. */
  events: AsyncIterable<PetrinautOptimizationEvent>;
  /** The optimizer's `X-Optimization-Run-ID` header, when provided. */
  optimizationRunId: string | null;
};

/** Configuration for attaching to one detached Petrinaut Optimizer run. */
export type AttachPetrinautOptimizationRunStreamOptions = {
  /** Base URL (origin) of the Petrinaut Optimizer service. */
  endpoint: string | URL;
  /** Identifier of the detached run to attach to. */
  runId: string;
  /**
   * Replay frames with sequence numbers greater than this cursor before
   * live-tailing. Omitted or `0` requests a full replay.
   */
  cursor?: number;
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Optional maximum UTF-8 size of one upstream SSE event. */
  maxEventBytes?: number;
  /** Called whenever upstream bytes arrive, including heartbeats. */
  onActivity?: () => void;
  /** Extra headers forwarded upstream (e.g. the owner's account tag). */
  headers?: Record<string, string>;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /** Signal used to cancel the request and its response stream. */
  signal?: AbortSignalLike;
};

/**
 * Attach to a detached run's event stream via
 * `GET /optimize/runs/{run_id}/events`.
 *
 * Buffered frames with seq > cursor are replayed, then new frames are
 * live-tailed; each adapted event carries the frame's sequence number as
 * `seq` so the consumer can re-attach from where it stopped. No synthetic
 * `started` event is emitted: the study started when the run was created,
 * not when this consumer attached. Disconnecting never affects the run
 * itself.
 */
export const attachPetrinautOptimizationRunStream = async ({
  endpoint,
  runId,
  cursor,
  fetchImpl = fetch,
  headers,
  maxEventBytes,
  onActivity,
  requestId,
  signal,
}: AttachPetrinautOptimizationRunStreamOptions): Promise<PetrinautOptimizationStreamHandle> => {
  const url = petrinautOptimizerUrl(
    endpoint,
    `optimize/runs/${encodeURIComponent(runId)}/events`,
  );
  if (cursor !== undefined) {
    url.searchParams.set("cursor", String(cursor));
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
      ...headers,
    },
    signal: signal as AbortSignal | undefined,
  });
  if (!response.ok) {
    throw await petrinautOptimizerHttpErrorFromResponse(response);
  }
  if (!response.body) {
    throw new Error("Petrinaut optimizer returned an empty response");
  }

  // Recorded by the optimizer at creation; it only shapes the synthesized
  // `complete` summary event — the completed/pruned/failed counts in that
  // summary reflect the frames observed by *this* attachment (everything
  // past the cursor), not necessarily the whole study. Clamped to 1 when the
  // header is missing (an older optimizer): a cosmetic undercount must not
  // fail canonical-event validation and kill the attachment.
  const requestedTrials = Math.max(
    1,
    Number(response.headers.get("x-requested-trials")) || 0,
  );

  return {
    events: decodePetrinautOptimizerStream(response.body, {
      requestedTrials,
      ...(maxEventBytes === undefined ? {} : { maxEventBytes }),
      ...(onActivity ? { onActivity } : {}),
    }),
    optimizationRunId: response.headers.get("x-optimization-run-id"),
  };
};
