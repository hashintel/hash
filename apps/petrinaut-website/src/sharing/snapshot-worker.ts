import brotliPromise from "brotli-wasm";

import {
  decompressSnapshot,
  compressSnapshot,
  SnapshotError,
} from "./snapshot-codec";

import type {
  SnapshotRequest,
  SnapshotResponse,
} from "./snapshot-worker-protocol";

self.onmessage = async (event: MessageEvent<SnapshotRequest>) => {
  let response: SnapshotResponse;
  try {
    const brotli = await brotliPromise;
    const request = event.data;
    response =
      request.kind === "encode"
        ? { kind: "encoded", hash: compressSnapshot(request.bytes, brotli) }
        : { kind: "decoded", bytes: decompressSnapshot(request.hash, brotli) };
  } catch (error) {
    response = {
      kind: "error",
      code: error instanceof SnapshotError ? error.code : "unavailable",
    };
  }
  self.postMessage(response);
};
