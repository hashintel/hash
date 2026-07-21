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
const edgeRowIds = [9];

/** HEAD with two nodes, one edge, detail trailer declared. */
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
    [7, cborBool(true)],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    entries.set(Number(key), value!);
  }
  return [...entries.entries()].sort(([left], [right]) => left - right);
};

/** Trailer with resolved property names: age (neg int), name (tstr), score (f64). */
const defaultTrailer = (): number[] =>
  cborMap([
    [0, cborArray([cborTstr("Café"), cborNull()])],
    [1, cborArray([cborTstr("🦀"), cborNull()])],
    [
      2,
      cborArray([
        cborTstr("https://x.test/age/"),
        cborTstr("https://x.test/name/"),
        cborTstr("https://x.test/score/"),
      ]),
    ],
    [
      3,
      cborArray([
        cborMap([
          [0, cborNegInt(-3)],
          [1, cborTstr("Ada")],
          [2, cborF64(0.5)],
        ]),
        cborNull(),
      ]),
    ],
    [4, cborArray([cborTstr("cites")])],
    [5, cborArray([cborNull()])],
    [6, cborArray([cborTstr("authored")])],
    [7, cborArray([cborNull()])],
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
    includeDetailedData: true,
    ...request,
  };
  const slots = payloads ?? [
    cborMap(head ?? defaultHead()),
    f32le(positions),
    u32le(rowIds),
    null,
    u32le(sources),
    u32le(targets),
    u32le(edgeRowIds),
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
    expect([...located.positions]).toEqual(positions);
    expect([...located.rowIds]).toEqual(rowIds);
    expect([...located.sources]).toEqual(sources);
    expect([...located.targets]).toEqual(targets);
    expect([...located.edgeRowIds]).toEqual(edgeRowIds);
    expect(located.typeMask).toBeNull();
    // Views over the response buffer, not copies.
    expect(located.positions.buffer).toBe(buffer);
    expect(located.rowIds.buffer).toBe(buffer);
    expect(located.sources.buffer).toBe(buffer);
  });

  it("resolves the interned detail trailer", () => {
    const { buffer, request } = fixture();
    const { detail } = decodeSaltileLocate(buffer, request);

    expect(detail?.labels).toEqual(["Café", null]);
    expect(detail?.icons).toEqual(["🦀", null]);
    expect(detail?.properties).toEqual([
      {
        "https://x.test/age/": -3,
        "https://x.test/name/": "Ada",
        "https://x.test/score/": 0.5,
      },
      null,
    ]);
    expect(detail?.linkLabels).toEqual(["cites"]);
    expect(detail?.linkIcons).toEqual([null]);
    expect(detail?.linkTypeLabels).toEqual(["authored"]);
    expect(detail?.linkTypeIcons).toEqual([null]);
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
        u32le(edgeRowIds),
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

  it("decodes a geometry-only response without a trailer", () => {
    const { buffer, request } = fixture({
      request: { includeDetailedData: false },
      head: defaultHead({ 7: cborBool(false) }),
      tail: [],
    });
    const located = decodeSaltileLocate(buffer, request);
    expect(located.detail).toBeNull();
    expect(located.count).toBe(2);
  });

  it("names every schema and echo rejection", () => {
    expect(
      failure(fixture({ request: { generation: new Uint8Array(32).fill(9) } })),
    ).toMatch(/generation does not match/u);

    expect(failure(fixture({ request: { variant: 5 } }))).toMatch(
      /HEAD variant is 2; the request expects 5/u,
    );

    expect(failure(fixture({ head: defaultHead({ 8: cborUint(1) }) }))).toMatch(
      /unknown key 8/u,
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
        u32le(edgeRowIds),
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
        u32le(edgeRowIds),
      ],
    });
    expect(failure(missingColumn)).toMatch(/EDGE_TARGETS\) is absent/u);

    // TYPE_MASK present without coloredTypeIds.
    const strayMask = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        [0, 0],
        u32le(sources),
        u32le(targets),
        u32le(edgeRowIds),
      ],
    });
    expect(failure(strayMask)).toMatch(/TYPE_MASK must be absent/u);

    expect(
      failure(
        fixture({
          request: { includeDetailedData: true },
          tail: [],
        }),
      ),
    ).toMatch(/carries no tail/u);

    expect(
      failure(
        fixture({
          request: { includeDetailedData: false },
          head: defaultHead({ 7: cborBool(false) }),
        }),
      ),
    ).toMatch(/HEAD declares no trailer/u);
  });

  it("rejects an unsorted interned property-name table", () => {
    const badTrailer = cborMap([
      [0, cborArray([cborTstr("Café"), cborNull()])],
      [1, cborArray([cborTstr("🦀"), cborNull()])],
      [
        2,
        cborArray([
          cborTstr("https://x.test/z/"),
          cborTstr("https://x.test/a/"),
        ]),
      ],
      [3, cborArray([cborNull(), cborNull()])],
      [4, cborArray([cborTstr("cites")])],
      [5, cborArray([cborNull()])],
      [6, cborArray([cborTstr("authored")])],
      [7, cborArray([cborNull()])],
    ]);
    expect(failure(fixture({ tail: badTrailer }))).toMatch(
      /bytewise-sorted and deduplicated/u,
    );
  });

  it("rejects a property index outside the intern table", () => {
    const badTrailer = cborMap([
      [0, cborArray([cborTstr("Café"), cborNull()])],
      [1, cborArray([cborTstr("🦀"), cborNull()])],
      [2, cborArray([cborTstr("https://x.test/only/")])],
      [3, cborArray([cborMap([[5, cborTstr("oops")]]), cborNull()])],
      [4, cborArray([cborTstr("cites")])],
      [5, cborArray([cborNull()])],
      [6, cborArray([cborTstr("authored")])],
      [7, cborArray([cborNull()])],
    ]);
    expect(failure(fixture({ tail: badTrailer }))).toMatch(
      /outside the intern table/u,
    );
  });
});
