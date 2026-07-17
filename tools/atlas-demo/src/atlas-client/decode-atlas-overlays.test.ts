import { describe, expect, it } from "vitest";

import {
  AtlasOverlayWireError,
  decodeAtlasContours,
  decodeAtlasFlows,
  type AtlasOverlayExpectation,
} from "./decode-atlas-overlays";

const generation = "11".repeat(32);
const storeSnapshotIdentity = "22".repeat(32);
const manifestHash = "33".repeat(32);
const releaseReportHash = "44".repeat(32);

const expectation: AtlasOverlayExpectation = {
  generation,
  manifestHash,
  releaseReportHash,
  storeSnapshotIdentity,
  variant: 0,
};

const writeHash = (view: DataView, offset: number, hash: string): void => {
  for (let index = 0; index < 32; index += 1) {
    const byte = Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16);
    view.setUint8(offset + index, byte);
  }
};

const writeHeader = (
  view: DataView,
  magic: string,
  countA: number,
  countB: number,
): void => {
  new Uint8Array(view.buffer).set(new TextEncoder().encode(magic));
  view.setUint16(8, 1, true);
  view.setUint16(10, 160, true);
  view.setUint16(12, 0, true);
  view.setUint32(16, countA, true);
  view.setUint32(20, countB, true);
  view.setUint32(24, 32, true);
  writeHash(view, 32, generation);
  writeHash(view, 64, storeSnapshotIdentity);
  writeHash(view, 96, manifestHash);
  writeHash(view, 128, releaseReportHash);
};

/** Two nested triangles: leaf 1 (child) inside leaf 0 (root). */
const contourFixture = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(160 + 2 * 20 + 6 * 4);
  const view = new DataView(buffer);
  writeHeader(view, "ATLCONT1", 2, 6);
  // Root leaf 0: no parent, three vertices.
  view.setUint32(160, 0, true);
  view.setUint32(164, 0xff_ff_ff_ff, true);
  view.setUint32(168, 3, true);
  view.setFloat32(172, 8, true);
  view.setFloat32(176, 0.5, true);
  // Child leaf 1: parent leaf 0, three vertices.
  view.setUint32(180, 1, true);
  view.setUint32(184, 0, true);
  view.setUint32(188, 3, true);
  view.setFloat32(192, 6, true);
  view.setFloat32(196, 2, true);
  const vertices = [0, 0, 60_000, 0, 0, 60_000, 100, 100, 200, 100, 100, 200];
  for (const [index, value] of vertices.entries()) {
    view.setUint16(200 + index * 2, value, true);
  }
  return buffer;
};

/** Three regions: 1 and 2 under root 0, plus one flow between them. */
const flowFixture = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(160 + 3 * 12 + 16);
  const view = new DataView(buffer);
  writeHeader(view, "ATLFLOW1", 3, 1);
  const regions = [
    { x: 500, y: 500, parent: 0xff_ff_ff_ff, persistence: 9 },
    { x: 100, y: 100, parent: 0, persistence: 4 },
    { x: 900, y: 900, parent: 0, persistence: 3 },
  ];
  for (const [index, region] of regions.entries()) {
    const offset = 160 + index * 12;
    view.setUint16(offset, region.x, true);
    view.setUint16(offset + 2, region.y, true);
    view.setUint32(offset + 4, region.parent, true);
    view.setFloat32(offset + 8, region.persistence, true);
  }
  view.setUint32(196, 1, true);
  view.setUint32(200, 2, true);
  view.setFloat32(204, 2.5, true);
  view.setUint32(208, 7, true);
  return buffer;
};

describe("decodeAtlasContours", () => {
  it("decodes nested rings with world positions and density levels", () => {
    const contours = decodeAtlasContours(contourFixture(), expectation);

    expect(contours.byteLength).toBe(224);
    expect(contours.gridSize).toBe(32);
    expect(contours.contours).toHaveLength(2);
    const [root, child] = contours.contours;
    expect(root?.parent).toBeUndefined();
    expect(root?.birth).toBe(8);
    expect(root?.death).toBe(0.5);
    expect([...(root?.positions ?? [])]).toEqual([
      0.5, 0.5, 60_000.5, 0.5, 0.5, 60_000.5,
    ]);
    expect(child?.parent).toBe(0);
    expect([...(child?.positions ?? [])]).toEqual([
      100.5, 100.5, 200.5, 100.5, 100.5, 200.5,
    ]);
  });

  it("rejects identity mismatches and inconsistent tables", () => {
    expect(() =>
      decodeAtlasContours(contourFixture(), {
        ...expectation,
        generation: "aa".repeat(32),
      }),
    ).toThrow(/generation identity/u);

    const truncated = contourFixture().slice(0, 200);
    expect(() => decodeAtlasContours(truncated, expectation)).toThrow(
      /counts require/u,
    );

    const degenerate = contourFixture();
    new DataView(degenerate).setUint32(188, 2, true);
    expect(() => decodeAtlasContours(degenerate, expectation)).toThrow(
      AtlasOverlayWireError,
    );

    const orphaned = contourFixture();
    new DataView(orphaned).setUint32(184, 9, true);
    expect(() => decodeAtlasContours(orphaned, expectation)).toThrow(
      /missing parent leaf 9/u,
    );
  });
});

describe("decodeAtlasFlows", () => {
  it("decodes region peaks, hierarchy, and aggregated flows", () => {
    const flows = decodeAtlasFlows(flowFixture(), expectation);

    expect(flows.byteLength).toBe(212);
    expect(flows.regions).toHaveLength(3);
    expect(flows.regions[0]?.parent).toBeUndefined();
    expect(flows.regions[1]?.parent).toBe(0);
    expect(flows.regions[1]?.x).toBe(100.5);
    expect(flows.flows).toEqual([
      { edgeCount: 7, source: 1, target: 2, weight: 2.5 },
    ]);
  });

  it("rejects unordered pairs, missing regions, and empty evidence", () => {
    const unordered = flowFixture();
    new DataView(unordered).setUint32(196, 2, true);
    expect(() => decodeAtlasFlows(unordered, expectation)).toThrow(
      /not ordered/u,
    );

    const missing = flowFixture();
    new DataView(missing).setUint32(200, 3, true);
    expect(() => decodeAtlasFlows(missing, expectation)).toThrow(
      /missing region 3/u,
    );

    const empty = flowFixture();
    new DataView(empty).setUint32(208, 0, true);
    expect(() => decodeAtlasFlows(empty, expectation)).toThrow(
      /zero semantic edges/u,
    );

    const magic = flowFixture();
    new Uint8Array(magic)[0] = 0;
    expect(() => decodeAtlasFlows(magic, expectation)).toThrow(/magic/u);
  });
});
