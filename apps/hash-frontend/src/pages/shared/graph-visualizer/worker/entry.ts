/**
 * Web worker entry point: dispatches {@link MainToWorkerMessage}s to a
 * {@link GraphWorker} and posts its replies and frames back to the main
 * thread.
 *
 * `INGEST_BATCH` applies immediately to the stores, but the resulting
 * structure commit is coalesced across a burst (see {@link CommitCoalescer});
 * every other handler that reads committed state (viewport, queries,
 * embedding results, pin/highlight) flushes the coalescer first so it never
 * observes a stale cut or layout. Buffers attached to `STRUCTURE_FRAME` and
 * `POSITIONS_FRAME` are exclusively worker-owned until transferred in
 * `postMessage`.
 */

import { CommitCoalescer } from "./core/commit-coalescer";
import { GraphWorker } from "./core/graph-worker";

import type { PositionsFrame, StructureFrame } from "../frames";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./protocol";

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerToMainMessage, transfer?: Transferable[]): void {
  workerScope.postMessage(message, transfer ?? []);
}

function postStructure(frame: StructureFrame): void {
  // The per-leaf edge-topology arrays are freshly built and owned by no one
  // else, so transfer their backing buffers.
  const transfer: Transferable[] = [];
  for (const layer of frame.entityLayers) {
    transfer.push(layer.internalEdges.buffer);
  }
  post({ type: "STRUCTURE_FRAME", frame }, transfer);
}

function postPositions(frame: PositionsFrame): void {
  const transfer: Transferable[] = [
    frame.clusterPositions.buffer,
    frame.beziers.positions.buffer,
    frame.beziers.colors.buffer,
    frame.beziers.widths.buffer,
    frame.beziers.clips.buffer,
    frame.beziers.ids.buffer,
  ];
  // Fan-out buffers are not shared with the main thread, so transfer avoids
  // a copy each tick.
  for (const entry of frame.entityFanOut) {
    transfer.push(entry.fanOut.buffer);
  }
  post({ type: "POSITIONS_FRAME", frame }, transfer);
}

let worker: GraphWorker | undefined;

/**
 * Coalesces per-batch commits during an ingest burst: batches are
 * ingested into the stores on arrival, but the commit (layout absorb, render
 * edges, structure frame -> main-thread rescans) runs once per burst. See
 * {@link CommitCoalescer} for the latency policy.
 */
let commits: CommitCoalescer | undefined;

let drainScheduled = false;

function scheduleDrain(): void {
  if (drainScheduled) {
    return;
  }
  drainScheduled = true;
  void Promise.resolve().then(() => {
    drainScheduled = false;
    if (!worker) {
      return;
    }
    for (const request of worker.drainEmbeddingRequests()) {
      post(request);
    }
  });
}

globalThis.onmessage = ({ data }: MessageEvent<MainToWorkerMessage>) => {
  switch (data.type) {
    case "INIT": {
      try {
        const created = new GraphWorker(data.config);
        worker = created;
        worker.registerTypes(data.typeSchemas, data.propertySchemas);
        worker.onLayoutMessage = (msg) => post(msg);
        worker.onStructureFrame = (frame) => postStructure(frame);
        worker.onPositionsFrame = (frame) => postPositions(frame);
        commits = new CommitCoalescer({
          commit: ({ deltas, rebuildTree }) => {
            const t0 = performance.now();
            created.commitStructure({ deltas, rebuildTree });
            // Re-style if an expand flipped an already-rendered frontier node to a root
            // (hierarchical tier only; the flat tier already restyled in the commit).
            // Must run after the commit: it consumes the pending-flip flag the flat
            // commit's style pass reads.
            created.restyleIfRootsFlipped();
            if (created.debug) {
              // eslint-disable-next-line no-console
              console.debug(
                `[graph-worker][commit] ${created.nodeCount} nodes, ` +
                  `${created.linkCount} links | ` +
                  `${deltas.length} group deltas` +
                  `${rebuildTree ? " + tree rebuild" : ""} | ` +
                  `${(performance.now() - t0).toFixed(1)}ms`,
              );
            }
            // commitStructure may enqueue EMBEDDING_CLUSTERING_NEEDED messages
            // that must post before the next ingest batch is coalesced.
            scheduleDrain();
          },
        });

        post({ type: "READY" });
      } catch (err) {
        post({ type: "ERROR", message: String(err) });
      }
      break;
    }

    case "REGISTER_TYPES": {
      if (!worker) {
        post({ type: "ERROR", message: "Worker not initialized" });
        break;
      }

      try {
        const { typesChanged } = worker.registerTypes(
          data.typeSchemas,
          data.propertySchemas,
        );
        // Only a genuinely new type changes grouping/colour, so only then does
        // the tree need rebuilding. Identical re-registrations (the common
        // case) and property-only additions do not: top-level cluster
        // re-layout on graph growth is triggered by ingest when a child
        // layout outgrows its parent bubble (clusterLayoutOutgrown), not by
        // type registration alone. Skipping rebuild on identical
        // re-registration keeps the overview responsive while ingest drives
        // top-level re-layout.
        //
        // The rebuild rides the coalescer so the frontier-expansion flow
        // (REGISTER_TYPES immediately followed by INGEST_BATCHes) lands as one
        // commit carrying both the rebuildTree flag and the merged deltas. A
        // lone registration flushes on the next queue drain (~a macrotask).
        if (typesChanged) {
          commits?.enqueueRebuildTree();
        }
      } catch (err) {
        post({ type: "ERROR", message: String(err) });
      }
      break;
    }

    case "INGEST_BATCH": {
      if (!worker) {
        post({ type: "ERROR", message: "Worker not initialized" });
        break;
      }

      const t0 = performance.now();
      const deltas = worker.ingestBatch(data.entities);
      const tIngest = performance.now();
      // The stores now hold the batch; the commit (and its restyle/debug log)
      // is deferred to the coalescer so a burst of queued batches pays for one.
      commits?.enqueueDeltas(deltas);
      if (worker.debug) {
        // eslint-disable-next-line no-console
        console.debug(
          `[graph-worker][ingest] +${data.entities.length} -> ${worker.nodeCount} nodes, ` +
            `${worker.linkCount} links | ` +
            `ingest ${(tIngest - t0).toFixed(1)}ms`,
        );
      }
      scheduleDrain();
      break;
    }

    case "VIEWPORT_CHANGED": {
      if (!worker) {
        break;
      }
      // Everything below INGEST_BATCH observes committed state (cuts, layouts,
      // the cluster tree), so a pending coalesced commit must land first.
      commits?.flush();
      worker.handleViewport({
        zoom: data.zoom,
        centerX: data.center[0],
        centerY: data.center[1],
        width: data.width,
        height: data.height,
      });
      scheduleDrain();
      break;
    }

    case "EMBEDDING_CLUSTERING_RESULT": {
      if (!worker) {
        break;
      }
      commits?.flush();
      worker.applyEmbeddingResult(data.clusterId, data.clusters);
      worker.commitStructure();
      break;
    }

    case "QUERY_EGO": {
      if (!worker) {
        break;
      }
      commits?.flush();
      post({
        type: "EGO_RESULT",
        requestId: data.requestId,
        targets: worker.ego(data.entityIdx),
      });
      break;
    }

    case "QUERY_HIGHWAY_LINKS": {
      if (!worker) {
        break;
      }
      commits?.flush();
      post({
        type: "HIGHWAY_LINKS_RESULT",
        requestId: data.requestId,
        linkEntityIdxs: worker.highwayLinks(data.laneId),
      });
      break;
    }

    case "CAPTURE_LAYOUT_FIXTURE": {
      if (!worker) {
        break;
      }
      commits?.flush();
      post({
        type: "LAYOUT_FIXTURE_RESULT",
        requestId: data.requestId,
        fixture: worker.captureLayoutFixture(),
      });
      break;
    }

    case "SET_PINNED": {
      if (!worker) {
        break;
      }
      commits?.flush();
      worker.pin(data.clusterId ?? undefined);
      break;
    }

    case "SET_HIGHLIGHT": {
      if (!worker) {
        break;
      }
      commits?.flush();
      worker.setHighlight(data.entityIdxs);
      break;
    }

    default: {
      const _: never = data;
      break;
    }
  }
};
