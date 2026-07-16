import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_TILE_MEDIA_TYPE,
  AtlasClientError,
  fetchAtlasTile,
  loadAtlasSession,
  type AtlasSession,
} from "./atlas-client";

const generation = "11".repeat(32);
const manifestHash = "22".repeat(32);
const releaseReportHash = "33".repeat(32);
const storeSnapshotIdentity = "44".repeat(32);

const currentPayload = {
  assurance_mode: "evidence_deferred_local",
  base_revision: 0,
  created_at: "2026-07-16T09:00:00Z",
  delta_revision: 0,
  generation,
  manifest_hash: manifestHash,
  release_report_hash: releaseReportHash,
};

const manifestPayload = {
  generation_id: generation,
  input_snapshot: {
    store_snapshot_identity: storeSnapshotIdentity,
  },
  storage: {
    row_count: 986_000,
    row_id_encoding: "u32",
  },
  variants: {
    canonical_variant: 0,
    entries: [{ id: 0 }],
  },
};

const session: AtlasSession = {
  assuranceMode: currentPayload.assurance_mode,
  baseRevision: 0,
  createdAt: currentPayload.created_at,
  deltaRevision: 0,
  generation,
  manifestHash,
  releaseReportHash,
  rowCount: 986_000,
  storeSnapshotIdentity,
  variant: 0,
};

const writeHash = (view: DataView, offset: number, hash: string): void => {
  for (let index = 0; index < 32; index += 1) {
    view.setUint8(
      offset + index,
      Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16),
    );
  }
};

const tileFixture = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(168);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("ATLTILE2"));
  const view = new DataView(buffer);
  view.setUint16(8, 2, true);
  view.setUint16(10, 160, true);
  view.setUint16(12, 0, true);
  view.setUint8(14, 0);
  view.setUint8(15, 1);
  view.setUint32(16, 0, true);
  view.setUint32(20, 0, true);
  view.setUint32(24, 1, true);
  view.setUint32(28, 1, true);
  writeHash(view, 32, generation);
  writeHash(view, 64, storeSnapshotIdentity);
  writeHash(view, 96, manifestHash);
  writeHash(view, 128, releaseReportHash);
  view.setUint32(160, 42, true);
  view.setUint16(164, 12_345, true);
  view.setUint16(166, 54_321, true);
  return buffer;
};

const jsonResponse = (
  payload: unknown,
  options: ResponseInit = {},
): Response => {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(payload), {
    ...options,
    headers,
  });
};

const fetchMock =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadAtlasSession", () => {
  it("cross-checks current state and selects the canonical variant", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(currentPayload))
      .mockResolvedValueOnce(
        jsonResponse(manifestPayload, {
          headers: { etag: `"${manifestHash}"` },
        }),
      );

    await expect(
      loadAtlasSession(new AbortController().signal),
    ).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/v1/atlas/current",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("classifies an absent active generation", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "no active Atlas generation" },
        { status: 404, statusText: "Not Found" },
      ),
    );

    const error = await loadAtlasSession(new AbortController().signal).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(AtlasClientError);
    expect(error).toMatchObject({
      kind: "no-active-generation",
      status: 404,
    });
  });

  it("rejects a manifest from a different generation", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(currentPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...manifestPayload,
          generation_id: "aa".repeat(32),
        }),
      );

    await expect(
      loadAtlasSession(new AbortController().signal),
    ).rejects.toMatchObject({ kind: "stale-generation" });
  });

  it("rejects row encodings that wire v2 cannot represent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(currentPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...manifestPayload,
          storage: { row_count: 986_000, row_id_encoding: "u64" },
        }),
      );

    await expect(
      loadAtlasSession(new AbortController().signal),
    ).rejects.toMatchObject({
      kind: "invalid-manifest",
      retryable: false,
    });
  });
});

describe("fetchAtlasTile", () => {
  it("validates the media type, diagnostic headers, and body identities", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(tileFixture(), {
        headers: {
          "content-type": ATLAS_TILE_MEDIA_TYPE,
          "x-atlas-delivered-count": "1",
          "x-atlas-visible-subtree-count": "1",
        },
      }),
    );

    const tile = await fetchAtlasTile(
      session,
      { z: 0, x: 0, y: 0 },
      new AbortController().signal,
    );

    expect(tile.rowIds[0]).toBe(42);
    expect(tile.positions[0]).toBe(12_345);
    expect(fetchMock).toHaveBeenCalledWith(
      `/v1/atlas/tile/${generation}/0/0/0/0`,
      expect.objectContaining({
        headers: { Accept: ATLAS_TILE_MEDIA_TYPE },
      }),
    );
  });

  it("rejects diagnostic headers that disagree with the body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(tileFixture(), {
        headers: {
          "content-type": ATLAS_TILE_MEDIA_TYPE,
          "x-atlas-delivered-count": "2",
        },
      }),
    );

    await expect(
      fetchAtlasTile(
        session,
        { z: 0, x: 0, y: 0 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "invalid-tile", retryable: false });
  });
});
