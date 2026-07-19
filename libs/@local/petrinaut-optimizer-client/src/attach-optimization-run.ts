import { decodePetrinautOptimizerStream } from "./decode-optimization-stream.js";
import { petrinautOptimizerHttpErrorFromResponse } from "./optimizer-http.js";

import type { PetrinautOptimizationStreamHandle } from "./open-optimization-stream.js";
import type { PetrinautOptimizerFetch } from "./optimizer-http.js";
import type {
  AbortSignalLike,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

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
  /**
   * Whether lower or higher objective values are considered better.
   *
   * Deliberately optional: an attachment that resumes past a cursor never
   * observes the whole study, so a best-so-far computed here would silently
   * disagree with the true running best. When omitted (the recommended
   * attachment configuration), the decoder skips best-so-far aggregation and
   * every trial and complete event carries `best: null` — the consumer keeps
   * its own running best across reconnections instead.
   */
  direction?: PetrinautOptimizationInput["objective"]["direction"];
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Optional maximum UTF-8 size of one upstream SSE event. */
  maxEventBytes?: number;
  /** Called whenever upstream bytes arrive, including heartbeats. */
  onActivity?: () => void;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /**
   * Number of trials requested by the run's manifest, recorded when the run
   * was created. It only shapes the synthesized `complete` summary event; the
   * completed/pruned/failed counts in that summary reflect the trial frames
   * observed by *this* attachment (everything past the cursor), not
   * necessarily the whole study.
   */
  requestedTrials: number;
  /** Signal used to cancel the request and its response stream. */
  signal?: AbortSignalLike;
};

/**
 * Attach to a detached run's event stream via
 * `GET /optimize/runs/{run_id}/events`.
 *
 * Buffered frames with seq > cursor are replayed, then new frames are
 * live-tailed; each adapted event carries the frame's sequence number as
 * `seq` so the consumer can re-attach from where it stopped. Unlike the
 * legacy study stream, no synthetic `started` event is emitted: the study
 * started when the run was created, not when this consumer attached.
 * Disconnecting never affects the run itself.
 */
export const attachPetrinautOptimizationRunStream = async ({
  endpoint,
  runId,
  cursor,
  direction,
  fetchImpl = fetch,
  maxEventBytes,
  onActivity,
  requestId,
  requestedTrials,
  signal,
}: AttachPetrinautOptimizationRunStreamOptions): Promise<PetrinautOptimizationStreamHandle> => {
  const url = new URL(
    `/optimize/runs/${encodeURIComponent(runId)}/events`,
    endpoint,
  );
  if (cursor !== undefined) {
    url.searchParams.set("cursor", String(cursor));
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
    },
    signal: signal as AbortSignal | undefined,
  });
  if (!response.ok) {
    throw await petrinautOptimizerHttpErrorFromResponse(response);
  }
  if (!response.body) {
    throw new Error("Petrinaut optimizer returned an empty response");
  }

  return {
    events: decodePetrinautOptimizerStream(response.body, {
      emitSyntheticStarted: false,
      requestedTrials,
      ...(direction === undefined ? {} : { direction }),
      ...(maxEventBytes === undefined ? {} : { maxEventBytes }),
      ...(onActivity ? { onActivity } : {}),
    }),
    optimizationRunId: response.headers.get("x-optimization-run-id"),
  };
};
