import { describe, expect, it } from "vitest";

import { decodeSaltileTile, type SaltileTileRequest } from "./tile";
import {
  DIRECTORY_ENTRY_BYTES,
  PAYLOAD_ALIGNMENT,
  PREFIX_BYTES,
  SaltileMode,
  SaltileWireError,
} from "./wire";

/* Minimal reference encoder for hand-built fixtures. CBOR integers and
 * floats are big-endian per RFC 8949; envelope integers and column
 * payloads are little-endian per the wire. */

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

const cborF32 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  return [0xfa, ...new Uint8Array(view.buffer)];
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
  kind: number,
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
    kind,
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
const positions = [0.25, -0.5, 0.125, 0.75, -1, 1];
const rowIds = [7, 11, 13];

type HeadEntries = [number, number[]][];

const defaultHead = (
  overrides: Partial<Record<number, number[]>> = {},
): HeadEntries => {
  const entries = new Map<number, number[]>([
    [0, cborBstr(generation)],
    [1, cborUint(2)],
    [2, cborArray([cborUint(3), cborUint(5), cborUint(1)])],
    [3, cborUint(SaltileMode.Delta)],
    [4, cborUint(3)],
    [5, cborUint(40)],
    [6, cborUint(9)],
    [7, cborArray([cborUint(3)])],
    [9, cborUint(5)],
    [10, cborBool(false)],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    entries.set(Number(key), value!);
  }
  return [...entries.entries()].sort(([left], [right]) => left - right);
};

interface TileFixture {
  request?: Partial<SaltileTileRequest>;
  head?: HeadEntries;
  payloads?: (number[] | null)[];
  tail?: number[];
}

/** A well-formed 3-point delta tile at z 3, overridable per case. */
const fixture = ({
  request = {},
  head,
  payloads,
  tail = [],
}: TileFixture = {}) => {
  const fullRequest: SaltileTileRequest = {
    generation: new Uint8Array(generation),
    variant: 2,
    coordinate: { z: 3, x: 5, y: 1 },
    mode: SaltileMode.Delta,
    deliverySpanLog2: 6,
    coloredTypeIdCount: 0,
    includeDetailedData: false,
    ...request,
  };
  const slots = payloads ?? [
    cborMap(head ?? defaultHead()),
    f32le(positions),
    u32le(rowIds),
    null,
    null,
  ];
  if (payloads === undefined && head !== undefined) {
    slots[0] = cborMap(head);
  }
  return { buffer: response(0x54, slots, tail), request: fullRequest };
};

const failure = (input: {
  buffer: ArrayBuffer;
  request: SaltileTileRequest;
}): string => {
  try {
    decodeSaltileTile(input.buffer, input.request);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileWireError);
    return (error as SaltileWireError).message;
  }
  throw new Error("expected the tile to be rejected");
};

describe("decodeSaltileTile", () => {
  it("decodes a delta tile into zero-copy views", () => {
    const { buffer, request } = fixture();
    const tile = decodeSaltileTile(buffer, request);

    expect(tile.delivered).toBe(3);
    expect(tile.visible).toBe(40);
    expect(tile.firstBucket).toBe(9);
    expect(tile.runs).toEqual([3]);
    expect(tile.children).toBe(5);
    expect([...tile.positions]).toEqual(positions);
    expect([...tile.rowIds]).toEqual(rowIds);
    expect(tile.positions.buffer).toBe(buffer);
    expect(tile.rowIds.buffer).toBe(buffer);
    expect(tile.typeMask).toBeNull();
    expect(tile.detail).toBeNull();
    expect(tile.global).toBeNull();
  });

  it("decodes TYPE_MASK and the trailer tail when the request asks", () => {
    const masks = [0b101, 0b000, 0b110];
    const { buffer, request } = fixture({
      request: { coloredTypeIdCount: 3, includeDetailedData: true },
      payloads: [
        cborMap(defaultHead({ 10: cborBool(true) })),
        f32le(positions),
        u32le(rowIds),
        masks,
        null,
      ],
      tail: cborMap([
        [
          0,
          cborArray([
            cborTstr("Alpha \u{1f30d}"),
            cborNull(),
            cborTstr("Gamma"),
          ]),
        ],
        [1, cborArray([cborNull(), cborNull(), cborTstr("rocket")])],
      ]),
    });
    const tile = decodeSaltileTile(buffer, request);

    expect([...tile.typeMask!]).toEqual(masks);
    expect(tile.detail?.labels).toEqual(["Alpha \u{1f30d}", null, "Gamma"]);
    expect(tile.detail?.icons).toEqual([null, null, "rocket"]);
  });

  it("refuses runs that do not sum to delivered, in either scope", () => {
    // The identity is law in every response (wire.md), so a mismatch is a
    // server defect and not the accepted hole an expired FIXME claimed.
    // Both directions, because a sum that overshoots is as wrong as one
    // that falls short and only one of them was ever exercised.
    const short = fixture({
      head: defaultHead({ 7: cborArray([cborUint(2)]) }),
    });
    expect(failure(short)).toMatch(/runs sum to 2; delivered is 3/u);

    const over = fixture({
      head: defaultHead({ 7: cborArray([cborUint(4)]) }),
    });
    expect(failure(over)).toMatch(/runs sum to 4; delivered is 3/u);
  });

  it("counts the head from the delivery cut a restricted caller is served at", () => {
    // k = 1, so the cut is z + m + k = 3 + 6 + 1 and the delta head's
    // firstBucket is 10 rather than 9. Taking m alone - the corpus span
    // exponent, which is what the session used before scopeSchedule was
    // read - refuses this tile at the head, which is how every restricted
    // caller was refused on its first tile.
    const restricted = defaultHead({ 6: cborUint(10) });
    const accepted = fixture({
      request: { deliverySpanLog2: 7 },
      head: restricted,
    });
    expect(
      decodeSaltileTile(accepted.buffer, accepted.request).firstBucket,
    ).toBe(10);

    const corpusSpanOnly = fixture({
      request: { deliverySpanLog2: 6 },
      head: restricted,
    });
    expect(failure(corpusSpanOnly)).toMatch(/firstBucket/u);
  });

  it("expects one run per bucket to the restricted cut in total mode", () => {
    // A total response carries z+m+k+1 entries with b0 = 0 (wire.md).
    const totalHead = (entries: number) =>
      defaultHead({
        3: cborUint(SaltileMode.Total),
        6: cborUint(0),
        7: cborArray(
          Array.from({ length: entries }, (_, index) =>
            cborUint(index === 0 ? 3 : 0),
          ),
        ),
      });
    const request = { mode: SaltileMode.Total, deliverySpanLog2: 7 } as const;
    const accepted = fixture({ request, head: totalHead(3 + 7 + 1) });
    expect(
      decodeSaltileTile(accepted.buffer, accepted.request).runs.length,
    ).toBe(11);

    const corpusSpanOnly = fixture({ request, head: totalHead(3 + 6 + 1) });
    expect(failure(corpusSpanOnly)).toMatch(/runs length/u);
  });

  it("decodes the root tile with its required global bounds", () => {
    const rootHead = defaultHead({
      2: cborArray([cborUint(0), cborUint(0), cborUint(0)]),
      6: cborUint(0),
      7: cborArray([cborUint(1), cborUint(0), cborUint(2)]),
      8: cborMap([
        [0, cborUint(40)],
        [
          1,
          cborArray([cborF32(-0.5), cborF32(-0.25), cborF32(0.75), cborF32(1)]),
        ],
        [2, cborUint(7)],
      ]),
      9: cborUint(15),
    });
    const { buffer, request } = fixture({
      request: { coordinate: { z: 0, x: 0, y: 0 }, deliverySpanLog2: 2 },
      head: rootHead,
    });
    const tile = decodeSaltileTile(buffer, request);
    expect(tile.runs).toEqual([1, 0, 2]);
    expect(tile.global?.bounds).toEqual([-0.5, -0.25, 0.75, 1]);
    expect(tile.global?.visibleAtZoom).toBe(40);

    const missingGlobal = fixture({
      request: { coordinate: { z: 0, x: 0, y: 0 }, deliverySpanLog2: 2 },
      head: defaultHead({
        2: cborArray([cborUint(0), cborUint(0), cborUint(0)]),
        6: cborUint(0),
        7: cborArray([cborUint(1), cborUint(0), cborUint(2)]),
      }),
    });
    expect(failure(missingGlobal)).toMatch(/global is required on the root/u);
  });

  it("accepts absent bounds only for the empty visible set", () => {
    const emptyGlobal = cborMap([
      [0, cborUint(0)],
      [2, cborUint(0)],
    ]);
    const { buffer, request } = fixture({
      head: defaultHead({ 8: emptyGlobal }),
    });
    expect(decodeSaltileTile(buffer, request).global?.bounds).toBeNull();

    const nonEmptyNoBounds = fixture({
      head: defaultHead({
        8: cborMap([
          [0, cborUint(12)],
          [2, cborUint(0)],
        ]),
      }),
    });
    expect(failure(nonEmptyNoBounds)).toMatch(
      /bounds are absent but the visible set is not empty/u,
    );
  });

  it("ignores populated slots it does not consume", () => {
    const { buffer, request } = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        null,
        u32le([50, 12, 8]), // populated MASS, ignored by choice
        [1, 2, 3, 4], // appended slot beyond the v1 table
      ],
    });
    const tile = decodeSaltileTile(buffer, request);
    expect(tile.delivered).toBe(3);
    expect([...tile.rowIds]).toEqual(rowIds);
  });

  it("decodes the empty tile with present-empty columns", () => {
    const { buffer, request } = fixture({
      head: defaultHead({
        4: cborUint(0),
        5: cborUint(0),
        7: cborArray([cborUint(0)]),
        9: cborUint(0),
      }),
      payloads: [
        cborMap(
          defaultHead({
            4: cborUint(0),
            5: cborUint(0),
            7: cborArray([cborUint(0)]),
            9: cborUint(0),
          }),
        ),
        [],
        [],
        null,
        null,
      ],
    });
    const tile = decodeSaltileTile(buffer, request);
    expect(tile.delivered).toBe(0);
    expect(tile.positions).toHaveLength(0);
    expect(tile.children).toBe(0);
  });

  it("names every schema and echo rejection", () => {
    const wrongGeneration = fixture({
      request: { generation: new Uint8Array(32).fill(9) },
    });
    expect(failure(wrongGeneration)).toMatch(/generation does not match/u);

    const wrongCoordinate = fixture({
      request: { coordinate: { z: 3, x: 5, y: 2 } },
    });
    expect(failure(wrongCoordinate)).toMatch(/HEAD y is 1/u);

    const wrongMode = fixture({ request: { mode: SaltileMode.Total } });
    expect(failure(wrongMode)).toMatch(/HEAD mode is 0/u);

    const badChildren = fixture({
      head: defaultHead({ 9: cborUint(16) }),
    });
    expect(failure(badChildren)).toMatch(/children carries bits/u);

    const unknownKey = fixture({
      head: defaultHead({ 11: cborUint(1) }),
    });
    expect(failure(unknownKey)).toMatch(/unknown key 11/u);

    const shortColumn = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions.slice(0, 4)),
        u32le(rowIds),
        null,
        null,
      ],
    });
    expect(failure(shortColumn)).toMatch(/16 bytes; 24 required/u);

    const missingColumn = fixture({
      payloads: [cborMap(defaultHead()), f32le(positions), null, null, null],
    });
    expect(failure(missingColumn)).toMatch(/slot 2 \(ROW_IDS\) is absent/u);

    const maskUnrequested = fixture({
      payloads: [
        cborMap(defaultHead()),
        f32le(positions),
        u32le(rowIds),
        [1, 2, 3],
        null,
      ],
    });
    expect(failure(maskUnrequested)).toMatch(/request sent no coloredTypeIds/u);

    const maskMissing = fixture({ request: { coloredTypeIdCount: 3 } });
    expect(failure(maskMissing)).toMatch(/slot 3 \(TYPE_MASK\) is absent/u);

    const trailerMissing = fixture({
      request: { includeDetailedData: true },
      head: defaultHead({ 10: cborBool(true) }),
    });
    expect(failure(trailerMissing)).toMatch(/carries no tail/u);

    const trailerDisagrees = fixture({
      request: { includeDetailedData: true },
    });
    expect(failure(trailerDisagrees)).toMatch(
      /HEAD trailer is false; the request expects true/u,
    );

    const undeclaredTail = fixture({ tail: [0xa0] });
    expect(failure(undeclaredTail)).toMatch(/HEAD declares no trailer/u);
  });
});
