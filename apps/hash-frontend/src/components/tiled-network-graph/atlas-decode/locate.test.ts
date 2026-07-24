import { describe, expect, it } from "vitest";

import { decodeSaltileLocate, type SaltileLocateRequest } from "./locate";
import {
  DIRECTORY_ENTRY_BYTES,
  PAYLOAD_ALIGNMENT,
  PREFIX_BYTES,
  SaltileWireError,
} from "./wire";

/* Reference encoder helpers; CBOR is big-endian, envelope and columns
 * little-endian, as in the tile/edges suites. */

const cborUint = (value: number, major = 0): number[] => {
  const base = major * 32;
  if (value < 24) {
    return [base + value];
  }
  if (value <= 0xff) {
    return [base + 24, value];
  }
  const wide = new DataView(new ArrayBuffer(2));
  wide.setUint16(0, value, false);
  return [base + 25, ...new Uint8Array(wide.buffer)];
};

/** A negative integer `value` (< 0) as CBOR major type 1. */
const cborNegInt = (value: number): number[] => cborUint(-1 - value, 1);

const cborBstr = (bytes: number[]): number[] => [
  ...cborUint(bytes.length, 2),
  ...bytes,
];

const cborTstr = (text: string): number[] => {
  const encoded = [...new TextEncoder().encode(text)];
  return [...cborUint(encoded.length, 3), ...encoded];
};

const cborArray = (entries: number[][]): number[] => [
  ...cborUint(entries.length, 4),
  ...entries.flat(),
];

const cborMap = (entries: [number, number[]][]): number[] => [
  ...cborUint(entries.length, 5),
  ...entries.flatMap(([key, value]) => [...cborUint(key), ...value]),
];

const cborNull = (): number[] => [0xf6];
const cborBool = (value: boolean): number[] => [value ? 0xf5 : 0xf4];

/** A double-precision float (0xFB), as locate property values ship. */
const cborF64 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return [0xfb, ...new Uint8Array(view.buffer)];
};

const f32le = (values: number[]): number[] => {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  for (const [index, value] of values.entries()) {
    view.setFloat32(index * 4, value, true);
  }
  return [...new Uint8Array(view.buffer)];
};

const u32le = (values: number[]): number[] => {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  for (const [index, value] of values.entries()) {
    view.setUint32(index * 4, value, true);
  }
  return [...new Uint8Array(view.buffer)];
};

const response = (
  payloads: (number[] | null)[],
  tail: number[] = [],
): ArrayBuffer => {
  const base = PREFIX_BYTES + payloads.length * DIRECTORY_ENTRY_BYTES;
  const directory = new DataView(
    new ArrayBuffer(payloads.length * DIRECTORY_ENTRY_BYTES),
  );
  const body: number[] = [];
  let cursor = base;
  for (const [slot, payload] of payloads.entries()) {
    if (payload === null) {
      continue;
    }
    directory.setUint32(slot * DIRECTORY_ENTRY_BYTES, cursor, true);
    directory.setUint32(
      slot * DIRECTORY_ENTRY_BYTES + 4,
      cursor + payload.length,
      true,
    );
    body.push(...payload);
    cursor += payload.length;
    while (cursor % PAYLOAD_ALIGNMENT !== 0) {
      body.push(0);
      cursor += 1;
    }
  }
  const prefix = new DataView(new ArrayBuffer(PREFIX_BYTES));
  for (const [index, byte] of [
    0x53,
    0x41,
    0x4c,
    0x54,
    0x49,
    0x4c,
    0x45,
    0x4c, // SALTILEL
  ].entries()) {
    prefix.setUint8(index, byte);
  }
  prefix.setUint16(8, 1, true);
  prefix.setUint16(12, payloads.length, true);
  return new Uint8Array([
    ...new Uint8Array(prefix.buffer),
    ...new Uint8Array(directory.buffer),
    ...body,
    ...tail,
  ]).buffer;
};

const generation = Array.from({ length: 32 }, (_, index) => index);
const positions = [0, 0, 0.5, -0.5];
const rowIds = [61, 11];
const sources = [61];
const targets = [11];

/** The source's 32-byte identity record: web uuid then entity uuid. */
const sourceEntityId = [
  ...Array.from({ length: 16 }, () => 0x42),
  ...Array.from({ length: 16 }, () => 0x24),
];
const sourceEntityIdString =
  "42424242-4242-4242-4242-424242424242~24242424-2424-2424-2424-242424242424";

/** One 32-byte link-entity identity record for the single edge. */
const edgeIdRecord = [
  ...Array.from({ length: 16 }, () => 0xd0),
  ...Array.from({ length: 16 }, () => 0xd1),
];
const edgeIdString =
  "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0~d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1";

/** HEAD with two nodes and one edge (wire.md section 8, keys 0-9). */
const defaultHead = (
  overrides: Partial<Record<number, number[]>> = {},
): [number, number[]][] => {
  const entries = new Map<number, number[]>([
    [0, cborBstr(generation)],
    [1, cborUint(2)],
    [2, cborUint(2)],
    [3, cborUint(3)],
    [4, cborArray([cborUint(3), cborUint(5), cborUint(2)])],
    [5, cborUint(1)],
    [6, cborBool(true)],
    [7, cborBstr(sourceEntityId)],
    [8, cborBool(true)],
    [9, cborBool(false)],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    entries.set(Number(key), value!);
  }
  return [...entries.entries()].sort(([left], [right]) => left - right);
};

/**
 * Trailer per wire.md section 8: intern tables first, then node arrays
 * (delivered order) and link arrays (edge order). The SOURCE alone
 * carries a property map; bitmasks are LSB-first byte strings.
 */
const defaultTrailer = (): number[] =>
  cborMap([
    [
      0,
      cborArray([
        cborTstr("https://t.test/authored/v/1"),
        cborTstr("https://t.test/person/v/3"),
      ]),
    ],
    [
      1,
      cborArray([
        cborTstr("https://x.test/age/"),
        cborTstr("https://x.test/name/"),
        cborTstr("https://x.test/score/"),
      ]),
    ],
    [2, cborArray([cborTstr("Café"), cborNull()])],
    [3, cborArray([cborUint(1), cborNull()])],
    [
      4,
      cborMap([
        [0, cborNegInt(-3)],
        [1, cborTstr("Ada")],
        [2, cborF64(0.5)],
      ]),
    ],
    [5, cborArray([cborTstr("cites")])],
    [6, cborArray([cborArray([cborUint(1), cborUint(0)])])],
    [7, cborBstr([0b0000_0001])],
    [8, cborArray([cborMap([[0, cborUint(7)]])])],
    [9, cborBstr([0b0000_0000])],
  ]);

interface LocateFixture {
  request?: Partial<SaltileLocateRequest>;
  head?: [number, number[]][];
  payloads?: (number[] | null)[];
  tail?: number[];
}

const fixture = ({
  request = {},
  head,
  payloads,
  tail,
}: LocateFixture = {}) => {
  const fullRequest: SaltileLocateRequest = {
    generation: new Uint8Array(generation),
    variant: 2,
    coloredTypeIdCount: 0,
    ...request,
  };
  const slots = payloads ?? [
    cborMap(head ?? defaultHead()),
    f32le(positions),
    u32le(rowIds),
    null,
    u32le(sources),
    u32le(targets),
    edgeIdRecord,
  ];
  return {
    buffer: response(slots, tail ?? defaultTrailer()),
    request: fullRequest,
  };
};

const failure = (input: {
  buffer: ArrayBuffer;
  request: SaltileLocateRequest;
}): string => {
  try {
    decodeSaltileLocate(input.buffer, input.request);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileWireError);
    return (error as SaltileWireError).message;
  }
  throw new Error("expected the locate response to be rejected");
};

describe("decodeSaltileLocate", () => {
  it("decodes a locate response into zero-copy views", () => {
    const { buffer, request } = fixture();
    const located = decodeSaltileLocate(buffer, request);

    expect(located.count).toBe(2);
    expect(located.edgesCount).toBe(1);
    expect(located.zoom).toBe(3);
    expect(located.cell).toEqual({ z: 3, x: 5, y: 2 });
    expect(located.complete).toBe(true);
    expect(located.entityId).toBe(sourceEntityIdString);
    expect(located.typeIdsComplete).toBe(true);
    expect(located.propertiesComplete).toBe(false);
    expect([...located.positions]).toEqual(positions);
    expect([...located.rowIds]).toEqual(rowIds);
    expect([...located.sources]).toEqual(sources);
    expect([...located.targets]).toEqual(targets);
    expect(located.edgeIds).toEqual([edgeIdString]);
    expect(located.typeMask).toBeNull();
    // Views over the response buffer, not copies.
    expect(located.positions.buffer).toBe(buffer);
    expect(located.rowIds.buffer).toBe(buffer);
    expect(located.sources.buffer).toBe(buffer);
  });

  it("resolves the interned detail trailer", () => {
    const { buffer, request } = fixture();
    const { detail } = decodeSaltileLocate(buffer, request);

    expect(detail.typeTable).toEqual([
      "https://t.test/authored/v/1",
      "https://t.test/person/v/3",
    ]);
    expect(detail.propertyTable).toEqual([
      "https://x.test/age/",
      "https://x.test/name/",
      "https://x.test/score/",
    ]);
    expect(detail.labels).toEqual(["Café", null]);
    expect(detail.typeIds).toEqual(["https://t.test/person/v/3", null]);
    // The SOURCE's map alone; neighbours ship no properties.
    expect(detail.properties).toEqual({
      "https://x.test/age/": -3,
      "https://x.test/name/": "Ada",
      "https://x.test/score/": 0.5,
    });
    expect(detail.linkLabels).toEqual(["cites"]);
    expect(detail.linkTypeIds).toEqual([
      ["https://t.test/person/v/3", "https://t.test/authored/v/1"],
    ]);
    expect(detail.linkTypeIdsComplete).toEqual([true]);
    expect(detail.linkProperties).toEqual([{ "https://x.test/age/": 7 }]);
    expect(detail.linkPropertiesComplete).toEqual([false]);
  });

  it("exposes the TYPE_MASK when colored types were requested", () => {
    const { buffer, request } = fixture({
      request: { coloredTypeIdCount: 3 },
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        [0b0000_0001, 0b0000_0010],
        u32le(sources),
        u32le(targets),
        edgeIdRecord,
      ],
    });
    const located = decodeSaltileLocate(buffer, request);
    expect([...(located.typeMask ?? [])]).toEqual([1, 2]);
  });

  it("reports cap truncation through complete", () => {
    const { buffer, request } = fixture({
      head: defaultHead({ 6: cborBool(false) }),
    });
    expect(decodeSaltileLocate(buffer, request).complete).toBe(false);
  });

  it("names every schema and echo rejection", () => {
    expect(
      failure(fixture({ request: { generation: new Uint8Array(32).fill(9) } })),
    ).toMatch(/generation does not match/u);

    expect(failure(fixture({ request: { variant: 5 } }))).toMatch(
      /HEAD variant is 2; the request expects 5/u,
    );

    expect(
      failure(fixture({ head: defaultHead({ 10: cborUint(1) }) })),
    ).toMatch(/unknown key 10/u);

    expect(
      failure(fixture({ head: defaultHead({ 7: cborBstr([1, 2, 3]) }) })),
    ).toMatch(/entityId \(key 7\) must be a 32-byte identity record/u);

    expect(failure(fixture({ head: defaultHead({ 8: cborUint(1) }) }))).toMatch(
      /typeIdsComplete \(key 8\) must be a boolean/u,
    );

    expect(
      failure(
        fixture({
          head: defaultHead({
            4: cborArray([cborUint(4), cborUint(5), cborUint(2)]),
          }),
        }),
      ),
    ).toMatch(/z equal to zoom/u);

    const shortColumn = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions.slice(0, 2)),
        u32le(rowIds),
        null,
        u32le(sources),
        u32le(targets),
        edgeIdRecord,
      ],
    });
    expect(failure(shortColumn)).toMatch(
      /POSITIONS\) is 8 bytes; 16 required/u,
    );

    const missingColumn = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        null,
        u32le(sources),
        null,
        edgeIdRecord,
      ],
    });
    expect(failure(missingColumn)).toMatch(/EDGE_TARGETS\) is absent/u);

    const shortIds = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        null,
        u32le(sources),
        u32le(targets),
        edgeIdRecord.slice(0, 16),
      ],
    });
    expect(failure(shortIds)).toMatch(/EDGE_IDS\) is 16 bytes; 32 required/u);

    // TYPE_MASK present without coloredTypeIds.
    const strayMask = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        [0, 0],
        u32le(sources),
        u32le(targets),
        edgeIdRecord,
      ],
    });
    expect(failure(strayMask)).toMatch(/TYPE_MASK must be absent/u);

    // Locate is the detail view: a missing trailer is a violation.
    expect(failure(fixture({ tail: [] }))).toMatch(
      /locate requires a trailer tail/u,
    );
  });

  it("rejects an unsorted intern table", () => {
    const badTrailer = cborMap([
      [0, cborArray([cborTstr("https://t.test/authored/v/1")])],
      [
        1,
        cborArray([
          cborTstr("https://x.test/z/"),
          cborTstr("https://x.test/a/"),
        ]),
      ],
      [2, cborArray([cborTstr("Café"), cborNull()])],
      [3, cborArray([cborNull(), cborNull()])],
      [4, cborNull()],
      [5, cborArray([cborNull()])],
      [6, cborArray([cborArray([])])],
      [7, cborBstr([0])],
      [8, cborArray([cborNull()])],
      [9, cborBstr([0])],
    ]);
    expect(failure(fixture({ tail: badTrailer }))).toMatch(
      /propertyTable must be bytewise-sorted/u,
    );
  });

  it("rejects a property index outside the intern table", () => {
    const badTrailer = cborMap([
      [0, cborArray([cborTstr("https://t.test/authored/v/1")])],
      [1, cborArray([cborTstr("https://x.test/only/")])],
      [2, cborArray([cborTstr("Café"), cborNull()])],
      [3, cborArray([cborNull(), cborNull()])],
      [4, cborMap([[5, cborTstr("oops")]])],
      [5, cborArray([cborNull()])],
      [6, cborArray([cborArray([])])],
      [7, cborBstr([0])],
      [8, cborArray([cborNull()])],
      [9, cborBstr([0])],
    ]);
    expect(failure(fixture({ tail: badTrailer }))).toMatch(
      /outside the intern table/u,
    );
  });

  it("rejects a bitmask of the wrong extent", () => {
    const badTrailer = cborMap([
      [0, cborArray([cborTstr("https://t.test/authored/v/1")])],
      [1, cborArray([cborTstr("https://x.test/only/")])],
      [2, cborArray([cborTstr("Café"), cborNull()])],
      [3, cborArray([cborNull(), cborNull()])],
      [4, cborNull()],
      [5, cborArray([cborNull()])],
      [6, cborArray([cborArray([])])],
      [7, cborBstr([0, 0])],
      [8, cborArray([cborNull()])],
      [9, cborBstr([0])],
    ]);
    expect(failure(fixture({ tail: badTrailer }))).toMatch(
      /linkTypeIdsComplete is 2 bytes; 1 required/u,
    );
  });
});
