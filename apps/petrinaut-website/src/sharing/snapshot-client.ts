import {
  canonicalSearchString,
  type SharedExampleSearch,
} from "../examples/example-search";
import {
  maxSnapshotHashLength,
  parseSnapshot,
  serializeSnapshot,
  SnapshotError,
  type Snapshot,
} from "./snapshot";

import type {
  SnapshotRequest,
  SnapshotResponse,
} from "./snapshot-worker-protocol";

const requestSnapshot = (
  request: SnapshotRequest,
  signal: AbortSignal,
): Promise<SnapshotResponse> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Snapshot request aborted", "AbortError"));
      return;
    }
    const worker = new Worker(
      new URL("./snapshot-worker.ts", import.meta.url),
      { type: "module" },
    );
    const listeners = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const finish = () => {
      worker.terminate();
      clearTimeout(timeout);
      listeners.abort();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Snapshot request aborted", "AbortError"));
    };
    timeout = setTimeout(() => {
      finish();
      reject(new SnapshotError("unavailable"));
    }, 30_000);
    signal.addEventListener("abort", abort, {
      once: true,
      signal: listeners.signal,
    });
    worker.onmessage = (event: MessageEvent<SnapshotResponse>) => {
      finish();
      if (event.data.kind === "error")
        reject(new SnapshotError(event.data.code));
      else resolve(event.data);
    };
    const fail = () => {
      finish();
      reject(new SnapshotError("unavailable"));
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    try {
      worker.postMessage(request);
    } catch {
      fail();
    }
  });

export const prepareSnapshot = async (
  snapshot: Snapshot,
  signal: AbortSignal,
): Promise<string> => {
  const response = await requestSnapshot(
    { kind: "encode", bytes: serializeSnapshot(snapshot) },
    signal,
  );
  if (response.kind !== "encoded") throw new SnapshotError("unavailable");
  return response.hash;
};

export const openSnapshot = async (
  hash: string,
  signal: AbortSignal,
): Promise<Snapshot> => {
  if (hash.length > maxSnapshotHashLength) throw new SnapshotError("too-large");
  if (!hash) throw new SnapshotError("invalid");
  const response = await requestSnapshot({ kind: "decode", hash }, signal);
  if (response.kind !== "decoded") throw new SnapshotError("unavailable");
  return parseSnapshot(response.bytes);
};

export const snapshotUrl = (
  origin: string,
  hash: string,
  search: SharedExampleSearch = {},
): string => {
  const url = new URL("/share", origin);
  url.hash = hash;
  url.search = canonicalSearchString(search);
  return url.href;
};
