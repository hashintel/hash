/**
 * Cross-language golden corpus harness (`SPEC-ADDENDUM-WIRE.md`
 * section 8): decodes the checked-in fixture bytes the Rust encoder
 * writes under `libs/@local/graph/atlas/fixtures/wire/` and asserts
 * field-for-field equality against each fixture's JSON sidecar -
 * THE SAME bytes both sides, never copies, floats via u32 bit
 * patterns. The corpus is discovered at collect time, so goldens
 * activate as pairs land; an empty corpus reports itself as one
 * passing placeholder.
 *
 * Each `<name>.saltile` pairs with `<name>.json` (the Rust
 * `goldens.rs` writer's format, regenerated with ATLAS_WIRE_BLESS=1).
 * The sidecar carries the decoded expectation plus the raw prefix and
 * directory, which this harness also asserts - that is what makes the
 * G9/G10 padding sweep a checked property on this side too. The
 * request context the decoders validate echoes against is derived
 * from the sidecar's HEAD fields; `coloredTypeIdCount` is recovered
 * from the mask stride, which decodes identically for every count in
 * the stride class.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { generationBytes } from "./saltile-client";
import { decodeSaltileEdges, type SaltileEdgesRequest } from "./saltile-edges";
import { decodeSaltileTile, type SaltileTileRequest } from "./saltile-tile";
import { SaltileMode } from "./saltile-wire";

const fixturesDir = fileURLToPath(
  new URL(
    "../../../../../../../@local/graph/atlas/fixtures/wire/",
    import.meta.url,
  ),
);

class SidecarError extends Error {
  override readonly name = "SidecarError";
}

/* Field accessors: variable-key reads that satisfy both the
 * index-signature and dot-notation lint regimes. */

const field = (record: Record<string, unknown>, key: string): unknown =>
  record[key];

const asRecord = (value: unknown, what: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SidecarError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
};

const asUint = (value: unknown, what: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SidecarError(`${what} must be an unsigned integer`);
  }
  return value;
};

const asBool = (value: unknown, what: string): boolean => {
  if (typeof value !== "boolean") {
    throw new SidecarError(`${what} must be a boolean`);
  }
  return value;
};

const asString = (value: unknown, what: string): string => {
  if (typeof value !== "string") {
    throw new SidecarError(`${what} must be a string`);
  }
  return value;
};

const asUintArray = (value: unknown, what: string): number[] => {
  if (!Array.isArray(value)) {
    throw new SidecarError(`${what} must be an array`);
  }
  return value.map((entry, index) => asUint(entry, `${what}[${index}]`));
};

const asNullableStringArray = (
  value: unknown,
  what: string,
): (string | null)[] => {
  if (!Array.isArray(value)) {
    throw new SidecarError(`${what} must be an array`);
  }
  return value.map((entry, index) =>
    entry === null ? null : asString(entry, `${what}[${index}]`),
  );
};

const readSidecar = (name: string): Record<string, unknown> =>
  asRecord(
    JSON.parse(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8")),
    `${name} sidecar`,
  );

/** Response bytes as a fresh ArrayBuffer (Buffer pooling defeated). */
const responseBuffer = (name: string): ArrayBuffer => {
  const bytes = readFileSync(path.join(fixturesDir, `${name}.saltile`));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

/** The u32 bit patterns of a decoded f32 column, for float equality. */
const bitsOf = (values: Float32Array): number[] => [
  ...new Uint32Array(values.buffer, values.byteOffset, values.length),
];

/** The u32 bit pattern of one decoded float (exact f64 -> f32). */
const bitOf = (value: number): number => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
};

/* Raw envelope assertions: the sidecar pins the prefix fields and the
 * whole offset directory, so padding placement (G9/G10's reason to
 * exist) is compared, not just tolerated. */

const expectEnvelope = (
  buffer: ArrayBuffer,
  sidecar: Record<string, unknown>,
): void => {
  const view = new DataView(buffer);
  const prefix = asRecord(field(sidecar, "prefix"), "prefix");

  const magic = new TextDecoder("ascii").decode(buffer.slice(0, 8));
  expect(magic).toBe(asString(field(prefix, "magic"), "prefix.magic"));
  expect(view.getUint16(8, true)).toBe(
    asUint(field(prefix, "wireVersion"), "prefix.wireVersion"),
  );
  expect(view.getUint16(10, true)).toBe(
    asUint(field(prefix, "flags"), "prefix.flags"),
  );
  const slotCount = asUint(field(prefix, "slotCount"), "prefix.slotCount");
  expect(view.getUint16(12, true)).toBe(slotCount);
  expect(view.getUint16(14, true)).toBe(
    asUint(field(prefix, "reserved"), "prefix.reserved"),
  );

  const directory = field(sidecar, "directory");
  if (!Array.isArray(directory) || directory.length !== slotCount) {
    throw new SidecarError("directory must list one entry per slot");
  }
  for (const [slot, entry] of directory.entries()) {
    const extent = asUintArray(entry, `directory[${slot}]`);
    expect([
      view.getUint32(16 + 8 * slot, true),
      view.getUint32(16 + 8 * slot + 4, true),
    ]).toEqual(extent);
  }
};

/* Request derivation: every echo the decoders validate is recoverable
 * from the sidecar's HEAD fields (the sidecar is the trusted side -
 * bytes disagreeing with it fail the echo checks). */

const tileRequest = (
  head: Record<string, unknown>,
  maskBytes: number | null,
): SaltileTileRequest => {
  const coordinate = asUintArray(field(head, "coordinate"), "coordinate");
  if (coordinate.length !== 3) {
    throw new SidecarError("head coordinate must be [z, x, y]");
  }
  const [z, x, y] = coordinate as [number, number, number];

  const mode = asUint(field(head, "mode"), "mode");
  if (mode !== SaltileMode.Delta && mode !== SaltileMode.Total) {
    throw new SidecarError(`head mode ${mode} is neither delta nor total`);
  }
  const firstBucket = asUint(field(head, "firstBucket"), "firstBucket");
  const runs = asUintArray(field(head, "runs"), "runs");
  const delivered = asUint(field(head, "delivered"), "delivered");

  // Delta tiles carry firstBucket = z + m (the root, buckets 0..=m);
  // total tiles carry z + m + 1 runs from bucket 0.
  const spanLog2 =
    mode === SaltileMode.Delta
      ? z === 0
        ? runs.length - 1
        : firstBucket - z
      : runs.length - 1 - z;
  if (spanLog2 < 0) {
    throw new SidecarError("head runs shape yields a negative spanLog2");
  }

  let coloredTypeIdCount = 0;
  if (maskBytes !== null) {
    if (delivered === 0 || !Number.isInteger(maskBytes / delivered)) {
      throw new SidecarError(
        "typeMask bytes do not divide into per-point strides",
      );
    }
    coloredTypeIdCount = (maskBytes / delivered) * 8;
  }

  return {
    generation: generationBytes(
      asString(field(head, "generation"), "generation"),
    ),
    variant: asUint(field(head, "variant"), "variant"),
    coordinate: { z, x, y },
    mode,
    spanLog2,
    coloredTypeIdCount,
    includeDetailedData: asBool(field(head, "trailer"), "trailer"),
  };
};

const expectTile = (
  buffer: ArrayBuffer,
  sidecar: Record<string, unknown>,
): void => {
  const head = asRecord(field(sidecar, "head"), "head");
  const mask = field(sidecar, "typeMask");
  const maskBytes = mask === null ? null : asUintArray(mask, "typeMask").length;

  const tile = decodeSaltileTile(buffer, tileRequest(head, maskBytes));

  expect(tile.delivered).toBe(asUint(field(head, "delivered"), "delivered"));
  expect(tile.visible).toBe(asUint(field(head, "visible"), "visible"));
  expect(tile.firstBucket).toBe(
    asUint(field(head, "firstBucket"), "firstBucket"),
  );
  expect([...tile.runs]).toEqual(asUintArray(field(head, "runs"), "runs"));
  expect(tile.children).toBe(asUint(field(head, "children"), "children"));

  expect(bitsOf(tile.positions)).toEqual(
    asUintArray(field(sidecar, "positions"), "positions"),
  );
  expect([...tile.rowIds]).toEqual(
    asUintArray(field(sidecar, "rowIds"), "rowIds"),
  );

  if (mask === null) {
    expect(tile.typeMask).toBeNull();
  } else {
    expect(tile.typeMask).not.toBeNull();
    expect([...tile.typeMask!]).toEqual(asUintArray(mask, "typeMask"));
  }

  const global = field(head, "global");
  if (global === null) {
    expect(tile.global).toBeNull();
  } else {
    const record = asRecord(global, "head.global");
    expect(tile.global).not.toBeNull();
    expect(tile.global!.visibleAtZoom).toBe(
      asUint(field(record, "visibleAtZoom"), "global.visibleAtZoom"),
    );
    expect(tile.global!.minResolution).toBe(
      asUint(field(record, "minResolution"), "global.minResolution"),
    );
    const bounds = field(record, "boundsBits");
    if (bounds === null) {
      expect(tile.global!.bounds).toBeNull();
    } else {
      expect(tile.global!.bounds).not.toBeNull();
      expect(tile.global!.bounds!.map(bitOf)).toEqual(
        asUintArray(bounds, "global.boundsBits"),
      );
    }
  }

  const trailer = field(sidecar, "trailer");
  if (trailer === null) {
    expect(tile.detail).toBeNull();
  } else {
    const record = asRecord(trailer, "trailer");
    expect(tile.detail).not.toBeNull();
    expect(tile.detail!.labels).toEqual(
      asNullableStringArray(field(record, "labels"), "trailer.labels"),
    );
    expect(tile.detail!.icons).toEqual(
      asNullableStringArray(field(record, "icons"), "trailer.icons"),
    );
  }
};

const edgesRequest = (head: Record<string, unknown>): SaltileEdgesRequest => ({
  generation: generationBytes(
    asString(field(head, "generation"), "generation"),
  ),
  variant: asUint(field(head, "variant"), "variant"),
  includeDetailedData: asBool(field(head, "trailer"), "trailer"),
});

const expectEdges = (
  buffer: ArrayBuffer,
  sidecar: Record<string, unknown>,
): void => {
  const head = asRecord(field(sidecar, "head"), "head");
  const edges = decodeSaltileEdges(buffer, edgesRequest(head));

  expect(edges.count).toBe(asUint(field(head, "count"), "count"));
  expect(edges.complete).toBe(asBool(field(head, "complete"), "complete"));
  expect([...edges.sources]).toEqual(
    asUintArray(field(sidecar, "sources"), "sources"),
  );
  expect([...edges.targets]).toEqual(
    asUintArray(field(sidecar, "targets"), "targets"),
  );
  expect([...edges.rowIds]).toEqual(
    asUintArray(field(sidecar, "edgeRowIds"), "edgeRowIds"),
  );

  // WIRE section 6a: edges deliver in ascending edge row id order.
  // Goldens conform to ratified CONTRACTS, not merely structure
  // (ruled 2026-07-20, WIRE decision log) - a golden violating a
  // pinned ordering is a bug in the golden.
  for (let index = 1; index < edges.count; index += 1) {
    if (edges.rowIds[index]! <= edges.rowIds[index - 1]!) {
      expect.fail(
        `rowIds[${index}] = ${edges.rowIds[index]} does not ascend past rowIds[${index - 1}] = ${edges.rowIds[index - 1]} (WIRE 6a)`,
      );
    }
  }

  const trailer = field(sidecar, "trailer");
  if (trailer === null) {
    expect(edges.detail).toBeNull();
  } else {
    const record = asRecord(trailer, "trailer");
    expect(edges.detail).not.toBeNull();
    for (const key of [
      "linkLabels",
      "linkIcons",
      "linkTypeLabels",
      "linkTypeIcons",
    ] as const) {
      expect(edges.detail![key]).toEqual(
        asNullableStringArray(field(record, key), `trailer.${key}`),
      );
    }
  }
};

const goldenNames = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".saltile"))
        .map((name) => name.slice(0, -".saltile".length))
        .sort()
    : [];

describe("SALTILE golden corpus", () => {
  const names = goldenNames(fixturesDir);

  if (names.length === 0) {
    it("is awaiting fixture bytes from the Rust encoder", () => {
      // The corpus directory is empty (or absent): the encoder side
      // has not landed golden pairs yet. This placeholder keeps the
      // harness green and visible until bytes arrive.
      expect(names).toEqual([]);
    });
    return;
  }

  for (const name of names) {
    it(`decodes ${name} to its sidecar expectation`, () => {
      const sidecar = readSidecar(name);
      const buffer = responseBuffer(name);

      expectEnvelope(buffer, sidecar);

      const layer = asString(field(sidecar, "layer"), "layer");
      if (layer === "tile") {
        expectTile(buffer, sidecar);
      } else if (layer === "edges") {
        expectEdges(buffer, sidecar);
      } else {
        throw new SidecarError(`${name} carries unknown layer ${layer}`);
      }
    });
  }
});

/* Rejection corpus, derived by mutation (SPEC 8's rejection list):
 * each case takes a PINNED golden's bytes - not this suite's own
 * synthetic builders, breaking the builder/decoder circularity - and
 * corrupts one named property, asserting the decoder's named error.
 * Mutations are self-locating: prefix offsets are the spec's fixed
 * layout, slot extents come from the sidecar's directory, and HEAD
 * value mutations find their bytes by unique pattern. */

/** The sidecar's directory as extents; null marks an absent slot. */
const sidecarDirectory = (
  sidecar: Record<string, unknown>,
): ([number, number] | null)[] => {
  const directory = field(sidecar, "directory");
  if (!Array.isArray(directory)) {
    throw new SidecarError("directory must be an array");
  }
  return directory.map((entry, slot) => {
    const extent = asUintArray(entry, `directory[${slot}]`);
    return extent[0] === 0 && extent[1] === 0 ? null : [extent[0]!, extent[1]!];
  });
};

/** Byte offset of a unique pattern inside `[start, end)`; asserts uniqueness. */
const findUnique = (
  bytes: Uint8Array,
  start: number,
  end: number,
  pattern: readonly number[],
): number => {
  const matches: number[] = [];
  for (let offset = start; offset + pattern.length <= end; offset += 1) {
    if (pattern.every((byte, index) => bytes[offset + index] === byte)) {
      matches.push(offset);
    }
  }
  expect(matches, "the mutation pattern must locate exactly once").toHaveLength(
    1,
  );
  return matches[0]!;
};

interface RejectionCase {
  /** The check the mutation violates, named as SPEC 8's list does. */
  readonly rejects: string;
  readonly golden: string;
  readonly errorName: "SaltileWireError" | "SaltileCborError";
  readonly message: RegExp;
  readonly mutate: (
    buffer: ArrayBuffer,
    sidecar: Record<string, unknown>,
  ) => ArrayBuffer;
}

const rejectionCases: readonly RejectionCase[] = [
  {
    rejects: "magic: wrong family prefix",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /SALTILE family/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0x58; // "X"
      return buffer;
    },
  },
  {
    rejects: "magic: kind not matching the request",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /kind is edges; the request expects tile/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[7] = 0x45; // "E"
      return buffer;
    },
  },
  {
    rejects: "magic: unknown kind byte",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /unknown kind byte/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[7] = 0x58; // "X"
      return buffer;
    },
  },
  {
    rejects: "prefix: wireVersion mismatch",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /wire version is 2/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[8] = 2;
      return buffer;
    },
  },
  {
    rejects: "prefix: nonzero flags",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /flags must be zero/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[10] = 1;
      return buffer;
    },
  },
  {
    rejects: "prefix: nonzero reserved",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /reserved bytes must be zero/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[14] = 1;
      return buffer;
    },
  },
  {
    rejects: "directory: slotCount below the kind's v1 table size",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /below the tile table size/u,
    mutate: (buffer) => {
      const bytes = new Uint8Array(buffer);
      bytes[12] = 4;
      return buffer;
    },
  },
  {
    rejects: "directory: absent HEAD slot",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /HEAD\) must be present/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      // Zero every directory entry: all slots absent, HEAD included.
      const slots = sidecarDirectory(sidecar).length;
      bytes.fill(0, 16, 16 + 8 * slots);
      return buffer;
    },
  },
  {
    rejects: "directory: non-sequential start",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /sequential layout requires/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      const start = sidecarDirectory(sidecar)[1]![0] + 8;
      new DataView(bytes.buffer).setUint32(16 + 8, start, true);
      return buffer;
    },
  },
  {
    rejects: "directory: end < start",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /ends before it starts/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      const end = sidecarDirectory(sidecar)[1]![0] - 4;
      new DataView(bytes.buffer).setUint32(16 + 8 + 4, end, true);
      return buffer;
    },
  },
  {
    rejects: "directory: extent beyond the response",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /extends beyond the response/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      const directory = sidecarDirectory(sidecar);
      const last =
        directory.length -
        1 -
        [...directory].reverse().findIndex((extent) => extent !== null);
      new DataView(bytes.buffer).setUint32(
        16 + 8 * last + 4,
        bytes.byteLength + 8,
        true,
      );
      return buffer;
    },
  },
  {
    rejects: "padding: nonzero pad byte",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /padding bytes must be zero/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      const padded = sidecarDirectory(sidecar).find(
        (extent) => extent !== null && extent[1] % 8 !== 0,
      );
      expect(padded, "the golden must carry a padded slot").toBeDefined();
      bytes[padded![1]] = 0xff;
      return buffer;
    },
  },
  {
    rejects: "cbor: map keys not ascending",
    golden: "g1-minimal-tile",
    errorName: "SaltileCborError",
    message: /occurs twice|not in ascending order/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      // HEAD key 1 (variant) follows the 32-byte generation string:
      // map head, key 0, bstr(32) head, 32 bytes, then 0x01.
      const start = sidecarDirectory(sidecar)[0]![0];
      const keyOffset = start + 1 + 1 + 2 + 32;
      expect(bytes[keyOffset]).toBe(0x01);
      bytes[keyOffset] = 0x00;
      return buffer;
    },
  },
  {
    rejects: "head values: nonzero reserved children bits",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /children carries bits above/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      // G1 pins children = 4 and no trailer: key 9, value 4, key 10,
      // false. Raise the value to 16, above the low four bits.
      const [start, end] = sidecarDirectory(sidecar)[0]!;
      const offset = findUnique(bytes, start, end, [0x09, 0x04, 0x0a, 0xf4]);
      bytes[offset + 1] = 16;
      return buffer;
    },
  },
  {
    rejects: "counts: runs sum != delivered",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /runs sum to 3; delivered is 2/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      // G1 pins delivered = 3, visible = 17: key 4, value 3, key 5,
      // value 17. Lower delivered without touching the runs.
      const [start, end] = sidecarDirectory(sidecar)[0]!;
      const offset = findUnique(bytes, start, end, [0x04, 0x03, 0x05, 0x11]);
      bytes[offset + 1] = 2;
      return buffer;
    },
  },
  {
    rejects: "echo: generation not matching the request",
    golden: "g1-minimal-tile",
    errorName: "SaltileWireError",
    message: /generation does not match the request/u,
    mutate: (buffer, sidecar) => {
      const bytes = new Uint8Array(buffer);
      // First byte of the generation string: map head, key 0, bstr
      // head (0x58 0x20), then the identity bytes.
      const start = sidecarDirectory(sidecar)[0]![0];
      expect(bytes[start + 2]).toBe(0x58);
      bytes[start + 4] = 255 - bytes[start + 4]!;
      return buffer;
    },
  },
  {
    rejects: "trailer: declared but absent",
    golden: "g5-trailer-tile",
    errorName: "SaltileWireError",
    message: /declared but the response carries no tail/u,
    mutate: (buffer, sidecar) => {
      // Cut the response at the trailer tail: the 8-aligned end of
      // the last present payload.
      const directory = sidecarDirectory(sidecar);
      const tail = Math.max(
        ...directory
          .filter((extent) => extent !== null)
          .map((extent) => Math.ceil(extent[1] / 8) * 8),
      );
      return buffer.slice(0, tail);
    },
  },
];

describe("SALTILE golden rejections (mutation-derived)", () => {
  const names = new Set(goldenNames(fixturesDir));

  for (const rejection of rejectionCases) {
    it(`rejects ${rejection.rejects}`, () => {
      if (!names.has(rejection.golden)) {
        throw new SidecarError(
          `${rejection.golden} is not in the pinned corpus`,
        );
      }
      const sidecar = readSidecar(rejection.golden);
      const mutated = rejection.mutate(
        responseBuffer(rejection.golden),
        sidecar,
      );

      let thrown: unknown;
      try {
        if (asString(field(sidecar, "layer"), "layer") === "tile") {
          expectTile(mutated, sidecar);
        } else {
          expectEdges(mutated, sidecar);
        }
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).name).toBe(rejection.errorName);
      expect((thrown as Error).message).toMatch(rejection.message);
    });
  }
});
