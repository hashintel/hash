/**
 * Streams the prop `entities` into the worker as append-only tail batches.
 *
 * Within one data source the array only grows (see the `sourceKey` prop), so each run
 * hands the worker just the yet-unsent tail. The sent count is keyed to the worker
 * handle it was sent to: a source change recreates the worker (a new handle), which
 * restarts the count at zero for a clean re-ingest — no reset effect needed.
 */
import { useEffect, useRef } from "react";

import { toIngestEntities } from "./ingest-mapping";

import type { WorkerHandle } from "../render/entity-worker-connection";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

interface UseEntityIngestOptions {
  readonly handle: WorkerHandle | undefined;
  readonly ready: boolean;
  readonly entities: readonly HashEntity[] | undefined;
  /**
   * Ingest waits for the first schema registration so the worker can group and
   * label the very first batch correctly (registration happens in
   * `useGraphWorker`'s effect, which runs before this one).
   */
  readonly schemasRegistered: boolean;
  readonly rootIdSet: ReadonlySet<EntityId> | undefined;
}

interface SentProgress {
  readonly handle: WorkerHandle;
  count: number;
}

export function useEntityIngest({
  handle,
  ready,
  entities,
  schemasRegistered,
  rootIdSet,
}: UseEntityIngestOptions): void {
  const sentRef = useRef<SentProgress | null>(null);

  useEffect(() => {
    if (!handle || !ready || !entities?.length || !schemasRegistered) {
      return;
    }

    if (sentRef.current?.handle !== handle) {
      sentRef.current = { handle, count: 0 };
    }

    const sent = sentRef.current;
    if (sent.count >= entities.length) {
      return;
    }

    const delta = entities.slice(sent.count);
    sent.count = entities.length;
    handle.ingestBatch(toIngestEntities(delta, rootIdSet));
  }, [handle, ready, entities, schemasRegistered, rootIdSet]);
}
