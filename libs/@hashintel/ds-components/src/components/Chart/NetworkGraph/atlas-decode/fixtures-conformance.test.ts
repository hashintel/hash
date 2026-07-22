/**
 * Conformance against the checked-in wire fixtures: the Rust encoder
 * writes `libs/@local/graph/atlas/fixtures/wire/*.saltile` with JSON
 * sidecars, and every decoder implementation asserts field-for-field
 * equality against them (wire.md section 10). "Matches the server" is
 * proven by shared bytes, never by eye.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeSaltileEdges } from "./edges";
import { decodeSaltileLocate } from "./locate";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../@local/graph/atlas/fixtures/wire",
);

const readFixture = (name: string): { buffer: ArrayBuffer; sidecar: never } => {
  const bytes = readFileSync(join(fixturesDir, `${name}.saltile`));
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const sidecar = JSON.parse(
    readFileSync(join(fixturesDir, `${name}.json`), "utf8"),
  ) as never;
  return { buffer, sidecar };
};

const bytesFromHex = (hex: string): Uint8Array =>
  new Uint8Array(
    Array.from({ length: hex.length / 2 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );

/** Sidecar 32-byte identity hex -> the decoder's `webUuid~entityUuid` form. */
const entityIdOfHex = (hex: string): string => {
  const uuid = (part: string): string =>
    `${part.slice(0, 8)}-${part.slice(8, 12)}-${part.slice(12, 16)}-${part.slice(16, 20)}-${part.slice(20)}`;
  return `${uuid(hex.slice(0, 32))}~${uuid(hex.slice(32))}`;
};

describe("wire fixtures", () => {
  it("decodes g6-edges field-for-field against its sidecar", () => {
    const { buffer, sidecar } = readFixture("g6-edges") as {
      buffer: ArrayBuffer;
      sidecar: {
        head: {
          generation: string;
          variant: number;
          count: number;
          complete: boolean;
          trailer: boolean;
        };
        sources: number[];
        targets: number[];
        edgeIds: string[];
        trailer: {
          typeTable: string[];
          linkLabels: (string | null)[];
          linkTypeIds: (number | null)[];
        };
      };
    };

    const decoded = decodeSaltileEdges(buffer, {
      generation: bytesFromHex(sidecar.head.generation),
      variant: sidecar.head.variant,
      includeDetailedData: sidecar.head.trailer,
    });

    expect(decoded.count).toBe(sidecar.head.count);
    expect(decoded.complete).toBe(sidecar.head.complete);
    expect([...decoded.sources]).toEqual(sidecar.sources);
    expect([...decoded.targets]).toEqual(sidecar.targets);
    expect(decoded.edgeIds).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    expect(decoded.detail?.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(decoded.detail?.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(decoded.detail?.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
  });

  it("decodes g7-locate field-for-field against its sidecar", () => {
    const { buffer, sidecar } = readFixture("g7-locate") as {
      buffer: ArrayBuffer;
      sidecar: {
        head: {
          generation: string;
          variant: number;
          count: number;
          zoom: number;
          cell: [number, number, number];
          edges: number;
          complete: boolean;
          entityId: string;
          typeIdsComplete: boolean;
          propertiesComplete: boolean;
        };
        positions: number[];
        rowIds: number[];
        sources: number[];
        targets: number[];
        edgeIds: string[];
        typeMask: number[];
        trailer: {
          typeTable: string[];
          propertyTable: string[];
          labels: (string | null)[];
          typeIds: (number | null)[];
          properties: Record<string, unknown>;
          linkLabels: (string | null)[];
          linkTypeIds: number[][];
          linkTypeIdsComplete: boolean[];
          linkProperties: (Record<string, unknown> | null)[];
          linkPropertiesComplete: boolean[];
        };
      };
    };

    // The fixture's TYPE_MASK column is one byte per point: the fixture
    // request carried between one and eight colored type ids.
    const decoded = decodeSaltileLocate(buffer, {
      generation: bytesFromHex(sidecar.head.generation),
      variant: sidecar.head.variant,
      coloredTypeIdCount: 8,
    });

    expect(decoded.count).toBe(sidecar.head.count);
    expect(decoded.zoom).toBe(sidecar.head.zoom);
    expect(decoded.cell).toEqual({
      z: sidecar.head.cell[0],
      x: sidecar.head.cell[1],
      y: sidecar.head.cell[2],
    });
    expect(decoded.edgesCount).toBe(sidecar.head.edges);
    expect(decoded.complete).toBe(sidecar.head.complete);
    expect(decoded.entityId).toBe(entityIdOfHex(sidecar.head.entityId));
    expect(decoded.typeIdsComplete).toBe(sidecar.head.typeIdsComplete);
    expect(decoded.propertiesComplete).toBe(sidecar.head.propertiesComplete);

    // Sidecar positions are f32 bit patterns (never printed decimals).
    const positionBits = new Uint32Array(
      decoded.positions.buffer,
      decoded.positions.byteOffset,
      decoded.positions.length,
    );
    expect([...positionBits]).toEqual(sidecar.positions);

    expect([...decoded.rowIds]).toEqual(sidecar.rowIds);
    expect([...decoded.sources]).toEqual(sidecar.sources);
    expect([...decoded.targets]).toEqual(sidecar.targets);
    expect(decoded.edgeIds).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    expect([...(decoded.typeMask ?? [])]).toEqual(sidecar.typeMask);

    const { detail } = decoded;
    expect(detail.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(detail.propertyTable).toEqual(sidecar.trailer.propertyTable);
    expect(detail.labels).toEqual(sidecar.trailer.labels);
    expect(detail.typeIds).toEqual(
      sidecar.trailer.typeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
    expect(detail.properties).toEqual(sidecar.trailer.properties);
    expect(detail.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(detail.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((indexes) =>
        indexes.map((index) => sidecar.trailer.typeTable[index]!),
      ),
    );
    expect(detail.linkTypeIdsComplete).toEqual(
      sidecar.trailer.linkTypeIdsComplete,
    );
    expect(detail.linkProperties).toEqual(sidecar.trailer.linkProperties);
    expect(detail.linkPropertiesComplete).toEqual(
      sidecar.trailer.linkPropertiesComplete,
    );
  });
});
