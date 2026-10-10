/// <reference types="node" />
import { createRequire } from "node:module";
import { brotliCompressSync } from "node:zlib";

import { expect, test } from "vitest";

import { parseSDCPNFile, serializeSDCPN } from "@hashintel/petrinaut-core";
import * as examples from "@hashintel/petrinaut-core/examples";

import {
  parseSnapshot,
  serializeSnapshot,
  type Snapshot,
  maxSnapshotBytes,
  maxSnapshotHashLength,
  SnapshotError,
} from "./snapshot";
import { snapshotUrl } from "./snapshot-client";
import { compressSnapshot, decompressSnapshot } from "./snapshot-codec";

import type { BrotliWasmType } from "brotli-wasm";

const brotli = createRequire(import.meta.url)("brotli-wasm") as BrotliWasmType;
const encodeSnapshot = (input: Snapshot, codec: BrotliWasmType) =>
  compressSnapshot(serializeSnapshot(input), codec);
const decodeSnapshot = (hash: string, codec: BrotliWasmType) =>
  parseSnapshot(decompressSnapshot(hash, codec));
const snapshot = {
  title: "Épidémie 🦠 / 複製",
  definition: examples.sirModel.petriNetDefinition,
};
const compressedHash = (text: string) =>
  `v1.br.${brotliCompressSync(Buffer.from(text)).toString("base64url")}`;

test.each(Object.entries(examples))(
  "round-trips the full %s example through URL-safe Brotli",
  (_name, example) => {
    const input = {
      title: snapshot.title,
      definition: example.petriNetDefinition,
    };
    const parsed = parseSDCPNFile(
      JSON.parse(
        serializeSDCPN({
          petriNetDefinition: input.definition,
          title: input.title,
          format: "json",
        }),
      ) as unknown,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    const { title, ...definition } = parsed.sdcpn;
    const hash = encodeSnapshot(input, brotli);
    expect(hash).toMatch(/^v1\.br\.[A-Za-z0-9_-]+$/u);
    expect(decodeSnapshot(hash, brotli)).toEqual({ title, definition });
    expect(hash.length).toBeLessThan(JSON.stringify(input).length);
  },
);

test("decodes compatible snapshots produced independently of the browser encoder", () => {
  const document = serializeSDCPN({
    petriNetDefinition: snapshot.definition,
    title: snapshot.title,
    format: "json",
  });
  expect(decodeSnapshot(compressedHash(document), brotli).title).toBe(
    snapshot.title,
  );
});

test.each(["", "garbage", "v1.br.", "v1.br.%%%%", "v1.br.A", "v1.br.AB"])(
  "rejects malformed link %s",
  (hash) => {
    expect(() => decodeSnapshot(hash, brotli)).toThrow(
      new SnapshotError("invalid"),
    );
  },
);

test("rejects future link formats", () => {
  expect(() => decodeSnapshot("v2.br.AAAA", brotli)).toThrow(
    new SnapshotError("unsupported"),
  );
});

test("rejects truncated compressed data and trailing bytes", () => {
  const hash = encodeSnapshot(snapshot, brotli);
  const bytes = Buffer.from(hash.slice("v1.br.".length), "base64url");
  expect(() =>
    decodeSnapshot(
      `v1.br.${bytes.subarray(0, -4).toString("base64url")}`,
      brotli,
    ),
  ).toThrow(new SnapshotError("invalid"));
  expect(() =>
    decodeSnapshot(
      `v1.br.${Buffer.concat([bytes, Buffer.from([0])]).toString("base64url")}`,
      brotli,
    ),
  ).toThrow(new SnapshotError("invalid"));
});

test.each(["not json", "null", '{"places":42}'])(
  "rejects decompressed content that is not a document",
  (text) => {
    expect(() => decodeSnapshot(compressedHash(text), brotli)).toThrow(
      new SnapshotError("invalid"),
    );
  },
);

test("bounds the encoded link before decompression", () => {
  expect(() =>
    decodeSnapshot("a".repeat(maxSnapshotHashLength + 1), brotli),
  ).toThrow(new SnapshotError("too-large"));
});

test("stops decompression when a short link expands beyond the document limit", () => {
  const hash = compressedHash("a".repeat(maxSnapshotBytes + 1));
  expect(hash.length).toBeLessThan(maxSnapshotHashLength);
  expect(() => decodeSnapshot(hash, brotli)).toThrow(
    new SnapshotError("too-large"),
  );
});

test("refuses documents larger than the input limit", () => {
  expect(() =>
    encodeSnapshot(
      { ...snapshot, title: "a".repeat(maxSnapshotBytes) },
      brotli,
    ),
  ).toThrow(new SnapshotError("too-large"));
});

test("puts only resumable view parameters in the query, with the document in the fragment", () => {
  const hash = encodeSnapshot(snapshot, brotli);
  const url = new URL(
    snapshotUrl("https://demo.petrinaut.org", hash, {
      mode: "simulate",
      view: "scenarios",
      subnet: "subnet / α",
    }),
  );
  expect(url.pathname).toBe("/share");
  expect(url.hash).toBe(`#${hash}`);
  expect(url.searchParams.get("subnet")).toBe("subnet / α");
  expect(new URL(snapshotUrl(url.origin, hash)).search).toBe("");
});
