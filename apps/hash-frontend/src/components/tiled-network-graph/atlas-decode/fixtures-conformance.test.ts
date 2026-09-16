/**
 * Conformance against wire fixtures produced by the Rust encoder.
 *
 * JSON sidecars contain the expected decoded fields. Positions use f32 bit patterns to preserve their encoded values.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Decoder } from "./Decoder";
import * as EdgeDocument from "./EdgeDocument";
import * as GenerationId from "./GenerationId";
import * as LocateDocument from "./LocateDocument";
import * as Option from "./Option";
import * as Result from "./Result";
import * as TileDocument from "./TileDocument";

import type { u64 } from "./Num";
import type * as TypeMask from "./TypeMask";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../libs/@local/graph/atlas/fixtures/wire",
);

const readFixture = (
  name: string,
): { buffer: ArrayBuffer; sidecar: unknown } => {
  const bytes = readFileSync(path.join(fixturesDir, `${name}.saltile`));
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const sidecar = JSON.parse(
    readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"),
  ) as unknown;
  return { buffer, sidecar };
};

/** f32 bit patterns -> the numbers a decoded column holds. */
const f32FromBits = (bits: readonly number[]): number[] => [
  ...new Float32Array(new Uint32Array(bits).buffer),
];

/** Position pairs as the f32 bit patterns stored in a sidecar. */
const positionBits = (
  column: Iterable<readonly [number, number]>,
): number[] => {
  const values = [...column].flatMap(([x, y]) => [x, y]);
  return [...new Uint32Array(Float32Array.from(values).buffer)];
};

/** Sidecar 32-byte identity hex -> the decoder's `webUuid~entityUuid` form. */
const entityIdOfHex = (hex: string): string => {
  const uuid = (part: string): string =>
    `${part.slice(0, 8)}-${part.slice(8, 12)}-${part.slice(12, 16)}-${part.slice(16, 20)}-${part.slice(20)}`;
  return `${uuid(hex.slice(0, 32))}~${uuid(hex.slice(32))}`;
};

const maskBytes = (
  column: TypeMask.TypeMaskColumn<ArrayBufferLike>,
): number[] =>
  [...column].flatMap((mask) => {
    const bytes = Array.from({ length: column.stride }, () => 0);
    for (const type of mask) {
      bytes[Math.floor(type / 8)]! += 2 ** (type % 8);
    }
    return bytes;
  });

// g7 encodes integral property values as CBOR integers.
const fixtureProperties = (properties: Record<string, unknown> | null) =>
  properties === null
    ? null
    : new Map(
        Object.entries(properties).map(([key, value]) => [
          key,
          typeof value === "number" && Number.isInteger(value)
            ? BigInt(value)
            : value,
        ]),
      );

/** Expected fields for a tile fixture. */
interface TileSidecar {
  readonly head: {
    readonly generation: string;
    readonly variant: number;
    readonly coordinate: [number, number, number];
    readonly mode: number;
    readonly delivered: number;
    readonly firstBucket: number;
    readonly runs: number[];
    readonly children: number;
    readonly trailer: boolean;
    readonly global: {
      readonly boundsBits: number[] | null;
      readonly minResolution: number;
      readonly visibleAtZoom: number;
    } | null;
  };
  readonly positions: number[];
  readonly rowIds: number[];
  readonly typeMask: number[] | null;
  readonly trailer: {
    readonly labels: (string | null)[];
    readonly icons: (string | null)[];
  } | null;
  readonly mass: number[] | null;
  readonly appended: Record<string, number[]> | null;
}

/**
 * Decodes a tile fixture against its sidecar.
 *
 * Mask storage has ceil(coloredTypeCount / 8) bytes per row. Using the full storage width as the requested count exposes every recorded mask bit.
 */
const decodeTileFixture = (
  name: string,
): {
  document: TileDocument.TileDocument<ArrayBuffer>;
  sidecar: TileSidecar;
} => {
  const { buffer, sidecar } = readFixture(name) as unknown as {
    buffer: ArrayBuffer;
    sidecar: TileSidecar;
  };
  const { head } = sidecar;
  const maskBytesPerPoint =
    sidecar.typeMask && head.delivered > 0
      ? sidecar.typeMask.length / head.delivered
      : 0;

  const document = Result.unwrap(
    TileDocument.decode(new Decoder(new DataView(buffer)), {
      generation: Result.unwrap(
        GenerationId.GenerationId.fromHex(head.generation),
      ),
      variant: BigInt(head.variant) as u64,
      coordinate: {
        z: BigInt(head.coordinate[0]) as u64,
        x: BigInt(head.coordinate[1]) as u64,
        y: BigInt(head.coordinate[2]) as u64,
      },
      mode: head.mode === 0 ? "delta" : "total",
      coloredTypeCount: maskBytesPerPoint * 8,
      detail: head.trailer ? "auxiliary" : "minimal",
    }),
  );

  expect(document.delivered).toBe(BigInt(head.delivered));
  expect(document.firstBucket).toBe(BigInt(head.firstBucket));
  expect(document.runs).toEqual(head.runs.map(BigInt));
  expect(document.children).toBe(BigInt(head.children));

  expect(document.runs.reduce((sum, run) => sum + run, 0n)).toBe(
    BigInt(head.delivered),
  );

  // Sidecar positions are f32 bit patterns (never printed decimals).
  expect(positionBits(document.positions)).toEqual(sidecar.positions);
  expect(document.positions).toHaveLength(head.delivered);
  expect([...document.rowIds]).toEqual(sidecar.rowIds);
  expect(Option.isSome(document.typeMask)).toBe(sidecar.typeMask !== null);
  if (Option.isSome(document.typeMask)) {
    expect(document.typeMask.value).toHaveLength(head.delivered);
    expect(maskBytes(document.typeMask.value)).toEqual(sidecar.typeMask);
  }
  expect(document.global).toEqual(
    head.global === null
      ? null
      : {
          visible: BigInt(head.global.visibleAtZoom),
          bounds:
            head.global.boundsBits === null
              ? null
              : f32FromBits(head.global.boundsBits),
          minResolution: BigInt(head.global.minResolution),
        },
  );

  return { document, sidecar };
};

describe("wire fixtures", () => {
  it("fixture_inventory", () => {
    // Names in comments also satisfy this inventory check.
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const fixtures = readdirSync(fixturesDir)
      .filter((entry) => entry.endsWith(".saltile"))
      .map((entry) => entry.replace(/\.saltile$/, ""));

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.filter((fixture) => !source.includes(fixture))).toEqual([]);
  });

  it("g1_minimal_tile", () => {
    const { document } = decodeTileFixture("g1-minimal-tile");

    // A delta tile below the root: one run, starting at the cut.
    expect(document.firstBucket).toBe(4n);
    expect(document.runs).toHaveLength(1);
    expect(document.global).toBeNull();
    expect(document.trailer).toBeNull();
  });

  it("g2_root_tile", () => {
    const { document, sidecar } = decodeTileFixture("g2-root-tile");
    const global = sidecar.head.global!;

    expect(document.global).toEqual({
      visible: BigInt(global.visibleAtZoom),
      bounds: f32FromBits(global.boundsBits!),
      minResolution: BigInt(global.minResolution),
    });
    // The root of a delta cascade starts at bucket 0 and carries the whole
    // schedule, gaps included.
    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(3);
    expect(document.trailer).toBeNull();
  });

  it("g3_total_tile", () => {
    const { document, sidecar } = decodeTileFixture("g3-total-tile");

    expect(sidecar.head.mode).toBe(1); // 1 = total mode on the wire
    // Total mode delivers every bucket up to the cut, from zero.
    expect(document.firstBucket).toBe(0n);
    expect(document.runs).toHaveLength(4);
    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect(document.typeMask.value.stride).toBe(2);
    expect(document.typeMask.value).toHaveLength(sidecar.head.delivered);
  });

  it("g4_empty_root", () => {
    const { document } = decodeTileFixture("g4-empty-root");

    expect(document.delivered).toBe(0n);
    expect(document.positions).toHaveLength(0);
    expect([...document.rowIds]).toEqual([]);
    expect(Option.isNone(document.typeMask)).toBe(true);
    expect(document.global).toEqual({
      visible: 0n,
      bounds: null,
      minResolution: 0n,
    });
  });

  it("g5_trailer_tile", () => {
    const { document, sidecar } = decodeTileFixture("g5-trailer-tile");
    const trailer = sidecar.trailer!;

    expect(document.trailer).not.toBeNull();
    expect(document.trailer?.labels).toEqual(trailer.labels);
    expect(document.trailer?.icons).toEqual(trailer.icons);
    expect(document.trailer?.labels).toHaveLength(sidecar.head.delivered);
  });

  it("g8_appended_slot", () => {
    const { document, sidecar } = decodeTileFixture("g8-appended-slot");

    // Reserved and appended slots remain encoded without affecting known columns.
    expect(sidecar.mass).not.toBeNull();
    expect(sidecar.appended).not.toBeNull();
    expect(document.trailer).toBeNull();
    expect(document.global).toBeNull();
  });

  it("g9_g10_alignment_padding", () => {
    const low = decodeTileFixture("g9-padding-low");
    const high = decodeTileFixture("g10-padding-high");

    // These fixtures have different alignment padding. g10 also appends unknown slots.
    expect([...low.document.rowIds]).toHaveLength(low.sidecar.head.delivered);
    expect([...high.document.rowIds]).toHaveLength(high.sidecar.head.delivered);
    expect(high.sidecar.appended).not.toBeNull();
  });

  it("r1_scoped_route_tile", () => {
    const { sidecar } = readFixture("r1-scoped-route-tile") as unknown as {
      sidecar: { declaration: { scopeSchedule: { k: number } } };
    };
    expect(sidecar.declaration.scopeSchedule.k).toBeGreaterThanOrEqual(1);

    const { document } = decodeTileFixture("r1-scoped-route-tile");
    expect(document.runs.reduce((sum, run) => sum + run, 0n)).toBe(
      document.delivered,
    );
    expect(document.delivered).toBe(30n);
    expect(document.children).toBe(5n);
  });

  it("g6_edges", () => {
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

    const document = Result.unwrap(
      EdgeDocument.decode(new Decoder(new DataView(buffer)), {
        generation: Result.unwrap(
          GenerationId.GenerationId.fromHex(sidecar.head.generation),
        ),
        variant: BigInt(sidecar.head.variant) as u64,
        detail: sidecar.head.trailer ? "auxiliary" : "minimal",
      }),
    );

    expect(document.count).toBe(BigInt(sidecar.head.count));
    expect(document.complete).toBe(sidecar.head.complete);
    expect([...document.sources]).toEqual(sidecar.sources);
    expect([...document.targets]).toEqual(sidecar.targets);
    expect(
      [...document.identities].map((identity) => identity.toString()),
    ).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    expect(document.trailer?.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(document.trailer?.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(document.trailer?.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
  });

  it("g7_locate", () => {
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
    const document = Result.unwrap(
      LocateDocument.decode(new Decoder(new DataView(buffer)), {
        generation: Result.unwrap(
          GenerationId.GenerationId.fromHex(sidecar.head.generation),
        ),
        variant: BigInt(sidecar.head.variant) as u64,
        coloredTypeCount: 8,
      }),
    );

    expect(document.count).toBe(BigInt(sidecar.head.count));
    expect(document.zoom).toBe(BigInt(sidecar.head.zoom));
    expect(document.cell).toEqual({
      z: BigInt(sidecar.head.cell[0]),
      x: BigInt(sidecar.head.cell[1]),
      y: BigInt(sidecar.head.cell[2]),
    });
    expect(document.edges).toBe(BigInt(sidecar.head.edges));
    expect(document.complete).toBe(sidecar.head.complete);
    expect(document.entityId.toString()).toBe(
      entityIdOfHex(sidecar.head.entityId),
    );
    expect(document.typeIdsComplete).toBe(sidecar.head.typeIdsComplete);
    expect(document.propertiesComplete).toBe(sidecar.head.propertiesComplete);

    // Sidecar positions are f32 bit patterns (never printed decimals).
    expect(positionBits(document.positions)).toEqual(sidecar.positions);
    expect([...document.rowIds]).toEqual(sidecar.rowIds);
    expect([...document.sources]).toEqual(sidecar.sources);
    expect([...document.targets]).toEqual(sidecar.targets);
    expect(
      [...document.edgeIds].map((identity) => identity.toString()),
    ).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    if (!Option.isSome(document.typeMask)) {
      throw new Error("expected a type mask column");
    }
    expect(document.typeMask.value.stride).toBe(1);
    expect(document.typeMask.value).toHaveLength(sidecar.head.count);
    expect(maskBytes(document.typeMask.value)).toEqual(sidecar.typeMask);

    const { trailer } = document;
    expect(trailer.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(trailer.propertyTable).toEqual(sidecar.trailer.propertyTable);
    expect(trailer.labels).toEqual(sidecar.trailer.labels);
    expect(trailer.typeIds).toEqual(
      sidecar.trailer.typeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
    expect(trailer.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(trailer.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((indexes) =>
        indexes.map((index) => sidecar.trailer.typeTable[index]!),
      ),
    );
    expect([...trailer.linkTypeIdsComplete]).toEqual(
      sidecar.trailer.linkTypeIdsComplete,
    );
    expect([...trailer.linkPropertiesComplete]).toEqual(
      sidecar.trailer.linkPropertiesComplete,
    );

    expect(trailer.properties).toEqual(
      fixtureProperties(sidecar.trailer.properties),
    );
    expect(trailer.linkProperties).toEqual(
      sidecar.trailer.linkProperties.map(fixtureProperties),
    );
  });
});
