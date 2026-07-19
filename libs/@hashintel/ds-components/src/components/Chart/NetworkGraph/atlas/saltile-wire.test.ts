import { describe, expect, it } from "vitest";

import {
  PREFIX_BYTES,
  readEnvelope,
  SaltileWireError,
  SECTION_ALIGNMENT,
  SECTION_FLAG_OPTIONAL,
  SectionId,
  type SaltileKind,
} from "./saltile-wire";

/** Builds one section: 8-byte header + payload zero-padded to 8. */
const section = (id: number, flags: number, payload: number[]): number[] => {
  const header = new DataView(new ArrayBuffer(8));
  header.setUint16(0, id, true);
  header.setUint16(2, flags, true);
  header.setUint32(4, payload.length, true);
  const padded = [...payload];
  while (padded.length % SECTION_ALIGNMENT !== 0) {
    padded.push(0);
  }
  return [...new Uint8Array(header.buffer), ...padded];
};

const kindByte: Record<SaltileKind, number> = {
  tile: 0x54,
  edges: 0x45,
  locate: 0x4c,
};

/** Builds a full response: 16-byte prefix + concatenated sections. */
const response = (kind: SaltileKind, sections: number[][]): ArrayBuffer => {
  const prefix = [
    0x53,
    0x41,
    0x4c,
    0x54,
    0x49,
    0x4c,
    0x45,
    kindByte[kind],
    1,
    0, // wireVersion u16 LE
    0,
    0, // flags
    0,
    0,
    0,
    0, // reserved
  ];
  return new Uint8Array([...prefix, ...sections.flat()]).buffer;
};

const head = (payload: number[] = [0xa0]): number[] =>
  section(SectionId.Head, 0, payload);

const failure = (buffer: ArrayBuffer, kind: SaltileKind = "tile"): string => {
  try {
    readEnvelope(buffer, kind);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileWireError);
    return (error as SaltileWireError).message;
  }
  throw new Error("expected the envelope to be rejected");
};

describe("readEnvelope", () => {
  it("locates sections of a minimal tile response", () => {
    const body = response("tile", [
      head([0xa0]),
      section(
        SectionId.Positions,
        0,
        Array.from({ length: 24 }, () => 1),
      ),
      section(
        SectionId.RowIds,
        0,
        Array.from({ length: 12 }, () => 2),
      ),
    ]);
    const envelope = readEnvelope(body, "tile");

    expect(envelope.kind).toBe("tile");
    expect(envelope.wireVersion).toBe(1);
    expect(envelope.sections.map((entry) => entry.id)).toEqual([
      SectionId.Head,
      SectionId.Positions,
      SectionId.RowIds,
    ]);
    expect(envelope.sections[1]).toMatchObject({
      byteLength: 24,
      payloadOffset: PREFIX_BYTES + 8 + 8 + 8,
    });
  });

  it("keeps every payload 8-aligned across all padding widths", () => {
    for (let length = 1; length <= SECTION_ALIGNMENT; length += 1) {
      const body = response("tile", [
        head(Array.from({ length }, () => 0x01)),
        section(SectionId.Positions, 0, [1, 2, 3, 4, 5, 6, 7, 8]),
      ]);
      const envelope = readEnvelope(body, "tile");
      for (const entry of envelope.sections) {
        expect(entry.payloadOffset % SECTION_ALIGNMENT).toBe(0);
      }
    }
  });

  it("accepts zero-length column sections", () => {
    const body = response("tile", [
      head(),
      section(SectionId.Positions, 0, []),
    ]);
    expect(readEnvelope(body, "tile").sections[1]?.byteLength).toBe(0);
  });

  it("passes the optional flag through", () => {
    const body = response("tile", [
      head(),
      section(SectionId.Mass, SECTION_FLAG_OPTIONAL, [1, 2, 3, 4]),
    ]);
    expect(readEnvelope(body, "tile").sections[1]?.flags).toBe(
      SECTION_FLAG_OPTIONAL,
    );
  });

  it("names the violated check for every envelope rejection", () => {
    const wrongFamily = response("tile", [head()]);
    new Uint8Array(wrongFamily)[0] = 0x58;
    expect(failure(wrongFamily)).toMatch(/SALTILE family/u);

    const unknownKind = response("tile", [head()]);
    new Uint8Array(unknownKind)[7] = 0x51;
    expect(failure(unknownKind)).toMatch(/unknown kind/u);

    expect(failure(response("edges", [head()]), "tile")).toMatch(
      /kind is edges; the request expects tile/u,
    );

    const badVersion = response("tile", [head()]);
    new Uint8Array(badVersion)[8] = 9;
    expect(failure(badVersion)).toMatch(/wire version is 9/u);

    const prefixFlags = response("tile", [head()]);
    new Uint8Array(prefixFlags)[10] = 1;
    expect(failure(prefixFlags)).toMatch(/prefix flags/u);

    const reserved = response("tile", [head()]);
    new Uint8Array(reserved)[13] = 1;
    expect(failure(reserved)).toMatch(/reserved bytes/u);

    expect(
      failure(response("tile", [section(SectionId.Positions, 0, [1])])),
    ).toMatch(/first section must be HEAD/u);

    expect(failure(response("tile", [head(), head()]))).toMatch(/twice/u);

    expect(
      failure(
        response("tile", [
          head(),
          section(SectionId.Trailer, 0, [0xa0]),
          section(SectionId.Positions, 0, [1, 2, 3, 4]),
        ]),
      ),
    ).toMatch(/TRAILER must be the last/u);

    expect(
      failure(
        response("tile", [
          head(),
          section(SectionId.RowIds, 0, [1, 2, 3, 4]),
          section(SectionId.Positions, 0, [1, 2, 3, 4]),
        ]),
      ),
    ).toMatch(/ascending column order/u);

    expect(failure(response("tile", []))).toMatch(/HEAD is mandatory/u);

    const midHeader = response("tile", [head()]).slice(0, PREFIX_BYTES + 3);
    expect(failure(midHeader)).toMatch(/inside a section header/u);

    const midPayload = response("tile", [
      head(),
      section(
        SectionId.Positions,
        0,
        Array.from({ length: 24 }, () => 1),
      ),
    ]).slice(0, PREFIX_BYTES + 8 + 8 + 8 + 20);
    expect(failure(midPayload)).toMatch(/inside a section payload/u);

    const midPadding = response("tile", [
      head(),
      section(SectionId.Positions, 0, [1, 2, 3]),
    ]).slice(0, PREFIX_BYTES + 8 + 8 + 8 + 3);
    expect(failure(midPadding)).toMatch(/inside section padding/u);

    const dirtyPadding = response("tile", [head([0xa0, 0x01, 0x02])]);
    new Uint8Array(dirtyPadding)[PREFIX_BYTES + 8 + 5] = 7;
    expect(failure(dirtyPadding)).toMatch(/padding bytes must be zero/u);

    const reservedSectionFlags = response("tile", [
      head(),
      section(SectionId.Positions, 0x0002, [1, 2, 3, 4]),
    ]);
    expect(failure(reservedSectionFlags)).toMatch(/reserved flag bits/u);
  });
});
