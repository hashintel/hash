import { describe, expect, it } from "vitest";

import { decodeSaltileEdges, type SaltileEdgesRequest } from "./edges";
import {
  DIRECTORY_ENTRY_BYTES,
  PAYLOAD_ALIGNMENT,
  PREFIX_BYTES,
  SaltileWireError,
} from "./wire";

/* Reference encoder helpers; CBOR is big-endian, envelope and columns
 * little-endian, as in the other suites. */

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
    0x45, // SALTILEE
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
const sources = [7, 11, 13];
const targets = [11, 42, 7];

/** Three 32-byte identity records in ascending byte order. */
const edgeIdRecords = [
  [
    ...Array.from({ length: 16 }, () => 0xa0),
    ...Array.from({ length: 16 }, () => 0xa1),
  ],
  [
    ...Array.from({ length: 16 }, () => 0xb0),
    ...Array.from({ length: 16 }, () => 0xb1),
  ],
  [
    ...Array.from({ length: 16 }, () => 0xc0),
    ...Array.from({ length: 16 }, () => 0xc1),
  ],
];
const edgeIdColumn = edgeIdRecords.flat();
const edgeIdStrings = [
  "a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0~a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
  "b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0~b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1",
  "c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0~c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1",
];

const defaultHead = (
  overrides: Partial<Record<number, number[]>> = {},
): [number, number[]][] => {
  const entries = new Map<number, number[]>([
    [0, cborBstr(generation)],
    [1, cborUint(2)],
    [2, cborUint(3)],
    [3, cborBool(true)],
    [4, cborBool(false)],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    entries.set(Number(key), value!);
  }
  return [...entries.entries()].sort(([left], [right]) => left - right);
};

interface EdgesFixture {
  request?: Partial<SaltileEdgesRequest>;
  head?: [number, number[]][];
  payloads?: (number[] | null)[];
  tail?: number[];
}

const fixture = ({
  request = {},
  head,
  payloads,
  tail = [],
}: EdgesFixture = {}) => {
  const fullRequest: SaltileEdgesRequest = {
    generation: new Uint8Array(generation),
    variant: 2,
    detail: "minimal",
    ...request,
  };
  const slots = payloads ?? [
    cborMap(head ?? defaultHead()),
    u32le(sources),
    u32le(targets),
    edgeIdColumn,
  ];
  return { buffer: response(slots, tail), request: fullRequest };
};

const failure = (input: {
  buffer: ArrayBuffer;
  request: SaltileEdgesRequest;
}): string => {
  try {
    decodeSaltileEdges(input.buffer, input.request);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileWireError);
    return (error as SaltileWireError).message;
  }
  throw new Error("expected the edges response to be rejected");
};

describe("decodeSaltileEdges", () => {
  it("decodes an edges response into zero-copy views and identity strings", () => {
    const { buffer, request } = fixture();
    const edges = decodeSaltileEdges(buffer, request);

    expect(edges.count).toBe(3);
    expect(edges.complete).toBe(true);
    expect([...edges.sources]).toEqual(sources);
    expect([...edges.targets]).toEqual(targets);
    expect(edges.edgeIds).toEqual(edgeIdStrings);
    expect(edges.sources.buffer).toBe(buffer);
    expect(edges.targets.buffer).toBe(buffer);
    expect(edges.detail).toBeNull();
  });

  it("reports cap truncation through complete", () => {
    const { buffer, request } = fixture({
      head: defaultHead({ 3: cborBool(false) }),
    });
    expect(decodeSaltileEdges(buffer, request).complete).toBe(false);
  });

  it("rejects an EDGE_IDS column out of ascending identity order", () => {
    const descending = [...edgeIdRecords].reverse().flat();
    const { buffer, request } = fixture({
      payloads: [
        cborMap(defaultHead()),
        u32le(sources),
        u32le(targets),
        descending,
      ],
    });
    expect(failure({ buffer, request })).toMatch(
      /EDGE_IDS record 1 is not in ascending identity order/u,
    );
  });

  it("decodes the trailer detail columns and resolves the intern table", () => {
    const { buffer, request } = fixture({
      request: { detail: "auxiliary" },
      head: defaultHead({ 4: cborBool(true) }),
      tail: cborMap([
        [
          0,
          cborArray([
            cborTstr("https://t.test/authored/v/1"),
            cborTstr("https://t.test/cites/v/2"),
          ]),
        ],
        [1, cborArray([cborTstr("employs"), cborNull(), cborTstr("owns")])],
        [2, cborArray([cborUint(1), cborUint(0), cborNull()])],
      ]),
    });
    const edges = decodeSaltileEdges(buffer, request);
    expect(edges.detail?.typeTable).toEqual([
      "https://t.test/authored/v/1",
      "https://t.test/cites/v/2",
    ]);
    expect(edges.detail?.linkLabels).toEqual(["employs", null, "owns"]);
    expect(edges.detail?.linkTypeIds).toEqual([
      "https://t.test/cites/v/2",
      "https://t.test/authored/v/1",
      null,
    ]);
  });

  it("rejects an unsorted intern table", () => {
    const { buffer, request } = fixture({
      request: { detail: "auxiliary" },
      head: defaultHead({ 4: cborBool(true) }),
      tail: cborMap([
        [
          0,
          cborArray([cborTstr("https://z.test/"), cborTstr("https://a.test/")]),
        ],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        [2, cborArray([cborNull(), cborNull(), cborNull()])],
      ]),
    });
    expect(failure({ buffer, request })).toMatch(
      /typeTable must be bytewise-sorted/u,
    );
  });

  it("rejects a type index outside the intern table", () => {
    const { buffer, request } = fixture({
      request: { detail: "auxiliary" },
      head: defaultHead({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray([cborTstr("https://t.test/only/v/1")])],
        [1, cborArray([cborNull(), cborNull(), cborNull()])],
        [2, cborArray([cborUint(1), cborNull(), cborNull()])],
      ]),
    });
    expect(failure({ buffer, request })).toMatch(
      /lies outside the intern table/u,
    );
  });

  it("decodes the empty edges response", () => {
    const { buffer, request } = fixture({
      head: defaultHead({ 2: cborUint(0) }),
      payloads: [cborMap(defaultHead({ 2: cborUint(0) })), [], [], []],
    });
    const edges = decodeSaltileEdges(buffer, request);
    expect(edges.count).toBe(0);
    expect(edges.sources).toHaveLength(0);
    expect(edges.edgeIds).toHaveLength(0);
  });

  it("names every schema and echo rejection", () => {
    expect(
      failure(fixture({ request: { generation: new Uint8Array(32).fill(9) } })),
    ).toMatch(/generation does not match/u);

    expect(failure(fixture({ request: { variant: 5 } }))).toMatch(
      /HEAD variant is 2; the request expects 5/u,
    );

    expect(failure(fixture({ head: defaultHead({ 5: cborUint(1) }) }))).toMatch(
      /unknown key 5/u,
    );

    expect(failure(fixture({ head: defaultHead({ 3: cborUint(1) }) }))).toMatch(
      /complete \(key 3\) must be a boolean/u,
    );

    const shortColumn = fixture({
      payloads: [
        cborMap(defaultHead()),
        u32le(sources.slice(0, 2)),
        u32le(targets),
        edgeIdColumn,
      ],
    });
    expect(failure(shortColumn)).toMatch(
      /EDGE_SOURCES\) is 8 bytes; 12 required/u,
    );

    const missingColumn = fixture({
      payloads: [cborMap(defaultHead()), u32le(sources), null, edgeIdColumn],
    });
    expect(failure(missingColumn)).toMatch(
      /slot 2 \(EDGE_TARGETS\) is absent/u,
    );

    const shortIds = fixture({
      payloads: [
        cborMap(defaultHead()),
        u32le(sources),
        u32le(targets),
        edgeIdColumn.slice(0, 64),
      ],
    });
    expect(failure(shortIds)).toMatch(/EDGE_IDS\) is 64 bytes; 96 required/u);

    expect(
      failure(
        fixture({
          request: { detail: "auxiliary" },
          head: defaultHead({ 4: cborBool(true) }),
        }),
      ),
    ).toMatch(/carries no tail/u);

    expect(failure(fixture({ tail: [0xa0] }))).toMatch(
      /HEAD declares no trailer/u,
    );

    const shortTrailer = fixture({
      request: { detail: "auxiliary" },
      head: defaultHead({ 4: cborBool(true) }),
      tail: cborMap([
        [0, cborArray([cborTstr("https://t.test/only/v/1")])],
        [1, cborArray([cborNull()])],
        [2, cborArray([cborNull()])],
      ]),
    });
    expect(failure(shortTrailer)).toMatch(
      /linkLabels must carry exactly 3 strings or nulls/u,
    );
  });
});
