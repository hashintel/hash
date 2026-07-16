import { describe, expect, it } from "vitest";

import {
  atlasDeliverySegments,
  atlasFairDeliveryCount,
  atlasMortonKey,
} from "./atlas-delivery-order";

import type { DecodedAtlasTile } from "./decode-atlas-tile";

const hash = "11".repeat(32);

const tile = (
  positions: readonly (readonly [number, number])[],
  complete: boolean,
): DecodedAtlasTile => ({
  byteLength: 160 + positions.length * 8,
  complete,
  coordinate: { z: 0, x: 0, y: 0 },
  deliveredCount: positions.length,
  generation: hash,
  manifestHash: hash,
  positions: new Uint16Array(positions.flat()),
  releaseReportHash: hash,
  rowIds: new Uint32Array(positions.map((_position, index) => index)),
  storeSnapshotIdentity: hash,
  variant: 0,
  visibleSubtreeCount: complete ? positions.length : positions.length * 3,
});

describe("atlasMortonKey", () => {
  it("interleaves x into even and y into odd bits like the server", () => {
    expect(atlasMortonKey(0, 0)).toBe(0);
    expect(atlasMortonKey(1, 0)).toBe(1);
    expect(atlasMortonKey(0, 1)).toBe(2);
    expect(atlasMortonKey(0xff_ff, 0)).toBe(0x55_55_55_55);
    expect(atlasMortonKey(0, 0xff_ff)).toBe(0xaa_aa_aa_aa);
    expect(atlasMortonKey(0xff_ff, 0xff_ff)).toBe(0xff_ff_ff_ff);
  });
});

describe("atlasDeliverySegments", () => {
  it("splits the delivery where the Morton key sequence decreases", () => {
    const segments = atlasDeliverySegments(
      tile(
        [
          [0, 0],
          [2, 2],
          [1, 1],
          [3, 3],
          [0, 3],
        ],
        false,
      ),
    );

    expect(segments).toEqual([
      { end: 2, start: 0 },
      { end: 4, start: 2 },
      { end: 5, start: 4 },
    ]);
  });

  it("keeps repeated keys inside one segment", () => {
    expect(
      atlasDeliverySegments(
        tile(
          [
            [5, 5],
            [5, 5],
            [6, 6],
          ],
          true,
        ),
      ),
    ).toEqual([{ end: 3, start: 0 }]);
  });

  it("returns no segments for an empty delivery", () => {
    expect(atlasDeliverySegments(tile([], true))).toEqual([]);
  });
});

describe("atlasFairDeliveryCount", () => {
  const multiSegmentPositions: readonly (readonly [number, number])[] = [
    [0, 0],
    [100, 100],
    [200, 200],
    [50, 50],
    [150, 150],
  ];

  it("keeps the whole delivery of a complete tile", () => {
    expect(atlasFairDeliveryCount(tile(multiSegmentPositions, true))).toBe(5);
  });

  it("drops the truncated trailing bucket of an incomplete tile", () => {
    expect(atlasFairDeliveryCount(tile(multiSegmentPositions, false))).toBe(3);
  });

  it("keeps a truncated single-bucket delivery for lack of a fallback", () => {
    expect(
      atlasFairDeliveryCount(
        tile(
          [
            [0, 0],
            [100, 100],
          ],
          false,
        ),
      ),
    ).toBe(2);
  });
});
