import { describe, expect, it, vi } from "vitest";

import {
  AtlasClientError,
  atlasTileBounds,
  atlasTileKey,
  type AtlasSession,
  type AtlasTileCoordinate,
  type DecodedAtlasTile,
} from "./atlas-client";
import {
  AtlasFrontier,
  atlasFitZoom,
  type AtlasTileFetcher,
} from "./atlas-frontier";

const hash = "11".repeat(32);
const session: AtlasSession = {
  assuranceMode: "evidence_deferred_local",
  baseRevision: 0,
  createdAt: "2026-07-16T09:00:00Z",
  deltaRevision: 0,
  generation: hash,
  manifestHash: hash,
  releaseReportHash: hash,
  rowCount: 100,
  storeSnapshotIdentity: hash,
  variant: 0,
};

interface PendingFetch {
  readonly coordinate: AtlasTileCoordinate;
  readonly reject: (error: unknown) => void;
  readonly resolve: (tile: DecodedAtlasTile) => void;
  readonly signal: AbortSignal;
  settled: boolean;
}

const tileFor = (coordinate: AtlasTileCoordinate): DecodedAtlasTile => {
  const bounds = atlasTileBounds(coordinate);
  const visibleSubtreeCount = Math.max(1, Math.round(100 / 4 ** coordinate.z));
  const deliveredCount = Math.min(2, visibleSubtreeCount);
  const rowBase =
    coordinate.z * 1_000_000 + coordinate.y * 1_000 + coordinate.x;
  const pointX = Math.floor((bounds.minimumX + bounds.maximumX) / 2);
  const pointY = Math.floor((bounds.minimumY + bounds.maximumY) / 2);
  return {
    byteLength: 160 + deliveredCount * 8,
    complete: deliveredCount === visibleSubtreeCount,
    coordinate,
    deliveredCount,
    generation: hash,
    manifestHash: hash,
    positions: new Uint16Array(
      Array.from({ length: deliveredCount }, () => [pointX, pointY]).flat(),
    ),
    releaseReportHash: hash,
    rowIds: new Uint32Array(
      Array.from({ length: deliveredCount }, (_, index) => rowBase + index),
    ),
    storeSnapshotIdentity: hash,
    variant: 0,
    visibleSubtreeCount,
  };
};

const controlledFetcher = (): {
  readonly fetchTile: AtlasTileFetcher;
  readonly pending: PendingFetch[];
} => {
  const pending: PendingFetch[] = [];
  const fetchTile: AtlasTileFetcher = (_session, coordinate, signal) =>
    new Promise((resolve, reject) => {
      const request: PendingFetch = {
        coordinate,
        reject,
        resolve,
        settled: false,
        signal,
      };
      signal.addEventListener(
        "abort",
        () => {
          if (!request.settled) {
            request.settled = true;
            reject(new DOMException("Aborted", "AbortError"));
          }
        },
        { once: true },
      );
      pending.push(request);
    });
  return { fetchTile, pending };
};

const activePending = (pending: readonly PendingFetch[]): PendingFetch[] =>
  pending.filter((request) => !request.settled);

const pendingAt = (
  pending: readonly PendingFetch[],
  index: number,
): PendingFetch => {
  const request = activePending(pending)[index];
  if (request === undefined) {
    throw new Error(`Expected active pending request at index ${index}`);
  }
  return request;
};

const resolveRequest = (request: PendingFetch): void => {
  request.settled = true;
  request.resolve(tileFor(request.coordinate));
};

describe("AtlasFrontier", () => {
  it("loads root first and replaces a parent only when all visible children are ready", async () => {
    const controlled = controlledFetcher();
    const frontier = new AtlasFrontier(session, {
      concurrency: 6,
      fetchTile: controlled.fetchTile,
    });
    const size = 512;
    frontier.setView({
      height: size,
      targetX: 32_768,
      targetY: 32_768,
      width: size,
      zoom: atlasFitZoom(size, size) - 1,
    });

    expect(
      activePending(controlled.pending).map(({ coordinate }) =>
        atlasTileKey(coordinate),
      ),
    ).toEqual(["0/0/0"]);
    resolveRequest(pendingAt(controlled.pending, 0));

    await vi.waitFor(() => {
      expect(activePending(controlled.pending)).toHaveLength(4);
    });
    expect(
      frontier
        .getSnapshot()
        .activeTiles.map(({ tile }) => atlasTileKey(tile.coordinate)),
    ).toEqual(["0/0/0"]);

    const children = activePending(controlled.pending);
    for (const child of children.slice(0, 3)) {
      resolveRequest(child);
    }
    await Promise.resolve();
    expect(frontier.getSnapshot().activeTiles).toHaveLength(1);

    resolveRequest(pendingAt(controlled.pending, 0));
    await vi.waitFor(() => {
      expect(frontier.getSnapshot().phase).toBe("ready");
    });

    const snapshot = frontier.getSnapshot();
    expect(snapshot.activeTiles).toHaveLength(4);
    expect(snapshot.visibleMass).toBe(100);
    expect(
      snapshot.activeTiles.every(({ massPerPoint }) => massPerPoint === 12.5),
    ).toBe(true);
    frontier.dispose();
  });

  it("aborts requests that leave the viewport working set", async () => {
    const controlled = controlledFetcher();
    const frontier = new AtlasFrontier(session, {
      concurrency: 2,
      fetchTile: controlled.fetchTile,
    });
    const size = 256;
    const zoom = 0;
    frontier.setView({
      height: size,
      targetX: 2_000,
      targetY: 2_000,
      width: size,
      zoom,
    });
    resolveRequest(pendingAt(controlled.pending, 0));
    await vi.waitFor(() => {
      expect(activePending(controlled.pending).length).toBeGreaterThan(0);
    });
    const oldRequest = pendingAt(controlled.pending, 0);

    frontier.setView({
      height: size,
      targetX: 63_000,
      targetY: 63_000,
      width: size,
      zoom,
    });

    expect(oldRequest.signal.aborted).toBe(true);
    frontier.dispose();
  });

  it("retains a failed parent until an explicit retry", async () => {
    const controlled = controlledFetcher();
    const frontier = new AtlasFrontier(session, {
      fetchTile: controlled.fetchTile,
    });
    frontier.setView({
      height: 512,
      targetX: 32_768,
      targetY: 32_768,
      width: 512,
      zoom: atlasFitZoom(512, 512),
    });

    const root = pendingAt(controlled.pending, 0);
    root.settled = true;
    root.reject(new AtlasClientError("network", "fixture failure"));

    await vi.waitFor(() => {
      expect(frontier.getSnapshot().phase).toBe("error");
    });
    expect(activePending(controlled.pending)).toHaveLength(0);

    frontier.retryFailed();
    await vi.waitFor(() => {
      expect(activePending(controlled.pending)).toHaveLength(1);
    });
    expect(atlasTileKey(pendingAt(controlled.pending, 0).coordinate)).toBe(
      "0/0/0",
    );
    frontier.dispose();
  });
});
