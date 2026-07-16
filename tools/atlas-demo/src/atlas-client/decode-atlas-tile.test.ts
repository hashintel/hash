import { describe, expect, it } from "vitest";

import {
  AtlasTileWireError,
  decodeAtlasTile,
  type AtlasTileExpectation,
} from "./decode-atlas-tile";

const generation = "11".repeat(32);
const storeSnapshotIdentity = "22".repeat(32);
const manifestHash = "33".repeat(32);
const releaseReportHash = "44".repeat(32);

const expectation: AtlasTileExpectation = {
  coordinate: { z: 1, x: 1, y: 0 },
  generation,
  manifestHash,
  releaseReportHash,
  storeSnapshotIdentity,
  variant: 0,
};

interface FixturePoint {
  readonly rowId: number;
  readonly x: number;
  readonly y: number;
}

interface FixtureOptions {
  readonly complete?: boolean;
  readonly coordinate?: AtlasTileExpectation["coordinate"];
  readonly generation?: string;
  readonly points?: readonly FixturePoint[];
  readonly variant?: number;
  readonly visible?: number;
}

const writeHash = (view: DataView, offset: number, hash: string): void => {
  for (let index = 0; index < 32; index += 1) {
    const byte = Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16);
    view.setUint8(offset + index, byte);
  }
};

const createFixture = (options: FixtureOptions = {}): ArrayBuffer => {
  const coordinate = options.coordinate ?? expectation.coordinate;
  const points = options.points ?? [
    { rowId: 7, x: 40_000, y: 2_000 },
    { rowId: 9, x: 62_000, y: 31_000 },
  ];
  const visible = options.visible ?? points.length;
  const complete = options.complete ?? visible === points.length;
  const buffer = new ArrayBuffer(160 + points.length * 8);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("ATLTILE2"));
  const view = new DataView(buffer);
  view.setUint16(8, 2, true);
  view.setUint16(10, 160, true);
  view.setUint16(12, options.variant ?? expectation.variant, true);
  view.setUint8(14, coordinate.z);
  view.setUint8(15, complete ? 1 : 0);
  view.setUint32(16, coordinate.x, true);
  view.setUint32(20, coordinate.y, true);
  view.setUint32(24, visible, true);
  view.setUint32(28, points.length, true);
  writeHash(view, 32, options.generation ?? generation);
  writeHash(view, 64, storeSnapshotIdentity);
  writeHash(view, 96, manifestHash);
  writeHash(view, 128, releaseReportHash);

  for (const [pointIndex, point] of points.entries()) {
    const offset = 160 + pointIndex * 8;
    view.setUint32(offset, point.rowId, true);
    view.setUint16(offset + 4, point.x, true);
    view.setUint16(offset + 6, point.y, true);
  }
  return buffer;
};

describe("decodeAtlasTile", () => {
  it("decodes the fixed header and interleaved point records", () => {
    const tile = decodeAtlasTile(createFixture(), expectation);

    expect(tile.complete).toBe(true);
    expect(tile.visibleSubtreeCount).toBe(2);
    expect(tile.deliveredCount).toBe(2);
    expect([...tile.rowIds]).toEqual([7, 9]);
    expect([...tile.positions]).toEqual([40_000, 2_000, 62_000, 31_000]);
    expect(tile.generation).toBe(generation);
  });

  it("accepts a truncated delivery with a complete visible count", () => {
    const tile = decodeAtlasTile(
      createFixture({ complete: false, visible: 12 }),
      expectation,
    );

    expect(tile.complete).toBe(false);
    expect(tile.visibleSubtreeCount).toBe(12);
    expect(tile.deliveredCount).toBe(2);
  });

  it("rejects malformed or truncated bodies", () => {
    const malformedMagic = createFixture();
    new Uint8Array(malformedMagic)[0] = 0;
    expect(() => decodeAtlasTile(malformedMagic, expectation)).toThrow(
      /magic/u,
    );

    const truncated = createFixture().slice(0, 165);
    expect(() => decodeAtlasTile(truncated, expectation)).toThrow(
      /counts require/u,
    );
  });

  it("rejects route and generation identity mismatches", () => {
    expect(() =>
      decodeAtlasTile(
        createFixture({ coordinate: { z: 1, x: 0, y: 0 } }),
        expectation,
      ),
    ).toThrow(/tile x/u);
    expect(() =>
      decodeAtlasTile(
        createFixture({ generation: "aa".repeat(32) }),
        expectation,
      ),
    ).toThrow(/generation identity/u);
  });

  it("rejects duplicate rows and points outside the requested quadrant", () => {
    expect(() =>
      decodeAtlasTile(
        createFixture({
          points: [
            { rowId: 7, x: 40_000, y: 2_000 },
            { rowId: 7, x: 42_000, y: 3_000 },
          ],
        }),
        expectation,
      ),
    ).toThrow(/repeats row 7/u);

    expect(() =>
      decodeAtlasTile(
        createFixture({
          points: [{ rowId: 8, x: 1_000, y: 2_000 }],
        }),
        expectation,
      ),
    ).toThrow(/outside tile/u);
  });

  it("uses a dedicated error type for wire failures", () => {
    const invalid = createFixture({ complete: true, visible: 3 });
    expect(() => decodeAtlasTile(invalid, expectation)).toThrow(
      AtlasTileWireError,
    );
  });
});
