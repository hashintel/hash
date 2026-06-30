import { GraphWorker } from "./core/graph-worker";

/**
 * Web worker entry point. Thin message dispatch to GraphWorker.
 *
 * The worker owns two emission channels, wired here to postMessage:
 *  - StructureFrame: rare (topology change), structured-clone with the small
 *    per-leaf edge-topology buffers transferred.
 *  - PositionsFrame: frequent while settling; its flat buffers are transferred
 *    (zero-copy) and held in a ref on the main thread, so nothing accumulates.
 */
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
  // Per-leaf fan-out endpoints are freshly built each tick, transfer them too.
  for (const entry of frame.entityFanOut) {
    transfer.push(entry.fanOut.buffer);
  }
  post({ type: "POSITIONS_FRAME", frame }, transfer);
}

let worker: GraphWorker | undefined;

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
        worker = new GraphWorker(data.config);
        worker.registerTypes(data.typeSchemas, data.propertySchemas);
        worker.onLayoutMessage = (msg) => post(msg);
        worker.onStructureFrame = (frame) => postStructure(frame);
        worker.onPositionsFrame = (frame) => postPositions(frame);
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
        worker.registerTypes(data.typeSchemas, data.propertySchemas);
        // Types drive labels/colours; force a fresh hierarchical rebuild (a no-op
        // for the flat tiers, which recompute colours from the registry anyway).
        worker.commitStructure({ rebuildTree: true });
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
      // The worker owns topology maintenance (cluster-tree vs flat layout),
      // gated by mode, so a tree rebuild can't clear the flat layout.
      worker.commitStructure({ deltas });
      // Re-style if an expand flipped an already-rendered frontier node to a root (hierarchical
      // tier only; the flat tier already restyled in the commit).
      worker.restyleIfRootsFlipped();
      const tCommit = performance.now();
      if (worker.debug) {
        // eslint-disable-next-line no-console
        console.debug(
          `[graph-worker][ingest] +${data.entities.length} → ${worker.nodeCount} nodes, ` +
            `${worker.linkCount} links | ` +
            `ingest ${(tIngest - t0).toFixed(1)}ms ` +
            `commit ${(tCommit - tIngest).toFixed(1)}ms`,
        );
      }
      scheduleDrain();
      break;
    }

    case "VIEWPORT_CHANGED": {
      if (!worker) {
        break;
      }
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
      worker.applyEmbeddingResult(data.clusterId, data.clusters);
      worker.commitStructure();
      break;
    }

    case "QUERY_EGO": {
      if (!worker) {
        break;
      }
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
      post({
        type: "HIGHWAY_LINKS_RESULT",
        requestId: data.requestId,
        linkEntityIdxs: worker.highwayLinks(data.laneId),
      });
      break;
    }

    case "SET_PINNED": {
      if (!worker) {
        break;
      }
      worker.pin(data.clusterId ?? undefined);
      break;
    }

    case "SET_HIGHLIGHT": {
      if (!worker) {
        break;
      }
      worker.setHighlight(data.entityIdxs);
      break;
    }
  }
};
