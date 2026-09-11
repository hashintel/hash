import type { SnapshotErrorCode } from "./snapshot-codec";

export type SnapshotRequest =
  | { kind: "encode"; bytes: Uint8Array }
  | { kind: "decode"; hash: string };

export type SnapshotResponse =
  | { kind: "encoded"; hash: string }
  | { kind: "decoded"; bytes: Uint8Array }
  | { kind: "error"; code: SnapshotErrorCode };
