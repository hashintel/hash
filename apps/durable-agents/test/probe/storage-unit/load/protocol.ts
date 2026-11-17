/**
 * The storage-unit load probe's protocol between the driver (users and their
 * browsers) and the server process that owns the Harnesses, over Node's
 * child-process IPC.
 */
export type Mode = "web" | "conversation";

export type ServeConfig = {
  readonly mode: Mode;
  readonly runId: string;
  readonly names: readonly string[];
  readonly latencyMs: readonly [number, number];
  readonly requestSlots: number;
  readonly poolMax: number;
};

/** Driver to server, before the link numbers it. */
export type RequestBody =
  | {
      readonly op: "submit";
      readonly name: string;
      readonly requestId: string;
      readonly text: string;
    }
  | {
      readonly op: "claim";
      readonly name: string;
      readonly callId: string;
      readonly claimant: string;
      readonly binding: string;
    }
  | {
      readonly op: "start";
      readonly name: string;
      readonly callId: string;
      readonly capability: string;
      readonly binding: string;
    }
  | {
      readonly op: "finish";
      readonly name: string;
      readonly callId: string;
      readonly capability: string;
      readonly binding: string;
      readonly toolName: string;
      readonly canonicalInput: unknown;
      readonly output: unknown;
      readonly metadata: unknown;
    }
  | { readonly op: "verify" }
  | { readonly op: "close" };

/** Driver to server. */
export type Request = RequestBody & { readonly rid: number };

export type TurnCount = {
  readonly users: Readonly<Record<string, number>>;
  readonly answers: Readonly<Record<string, number>>;
  readonly toolResults: Readonly<Record<string, number>>;
};

export type ServerStats = {
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  /** Process CPU time so far, microseconds. */
  readonly cpuMicros: number;
  readonly poolTotal: number;
  readonly poolWaiting: number;
  readonly peakPoolTotal: number;
  readonly peakPoolWaiting: number;
  /** `PostgresStorage.commit` calls since the last report: duration and batches each. */
  readonly commits: readonly (readonly [number, number])[];
  readonly commitErrors: Readonly<Record<string, number>>;
  readonly poolTimeouts: number;
};

/** Server to driver. */
export type Event =
  | {
      readonly t: "ready";
      readonly openMs: number;
      readonly resumeMs: number;
      readonly rssBytes: number;
    }
  | {
      readonly t: "reply";
      readonly rid: number;
      readonly ok: boolean;
      readonly value: unknown;
      /** How long the server took: for a browser op, its commit's wait and write. */
      readonly ms: number;
    }
  | {
      readonly t: "call";
      readonly name: string;
      readonly callId: string;
    }
  | { readonly t: "model"; readonly name: string }
  | { readonly t: "stats"; readonly stats: ServerStats };
