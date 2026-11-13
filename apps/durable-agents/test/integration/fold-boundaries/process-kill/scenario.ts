/**
 * The process-kill scenario both sides run: the child up to its kill point,
 * the test after it, each over the same storage with its own Harness, host
 * binding and faux model.
 *
 * The history: one input, `go`, whose model changes the net twice in two
 * rounds (c0 → R1, c1 → R2) and answers at length. The hook prunes c0's
 * read-back after c1's round. For the compaction points, a second input,
 * `Add a dryer.`, crosses the blocking threshold, so a threshold compaction
 * runs inside its run before its first request.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type CompactionPolicy,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

import { postgresConfigFromEnvironment } from "../../../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../../../src/storage/postgres/postgres-storage";
import {
  fauxAssistantMessage,
  filler,
  ok,
  scriptedModel,
} from "../../../platform/fold-boundaries/support";
import { call } from "../../../platform/support";

export const context = BACKGROUND_CONTEXT;

/**
 * - `terminal`: (i) the round is terminal, before the prune write;
 * - `admitted`: (ii) the write is admitted, before the boundary;
 * - `head`: (iii) a compaction head is placed, before the first request is prepared;
 * - `summarizing`: (iv) during a threshold compaction's summarization.
 */
export type KillPoint = "terminal" | "admitted" | "head" | "summarizing";

export const killPoints: readonly KillPoint[] = [
  "terminal",
  "admitted",
  "head",
  "summarizing",
];

export type StorageSpec =
  | { readonly kind: "postgres"; readonly schema: string }
  | { readonly kind: "sqlite"; readonly file: string };

export const openStorage = async (spec: StorageSpec): Promise<Storage> =>
  spec.kind === "postgres"
    ? openPostgresStorage({
        pool: postgresConfigFromEnvironment(),
        schema: spec.schema,
      })
    : openNodeSqliteStorage(spec.file);

/** Both sides name the same model: same provider, same ID, same window. */
export const model = () => scriptedModel({ contextWindow: 3000 });

/** Off for the history; the compaction points turn it on: blocking above 1,000 tokens. */
export const compactionPolicy = (enabled: boolean): CompactionPolicy => ({
  enabled,
  keepRecentTokens: 1,
  reserveTokens: 2000,
  backgroundTokens: 0,
});

export const historyInput = "go";
export const compactInput = "Add a dryer.";

/** The history's model responses. */
export const historyScript = () =>
  [
    call("change", "c0", ok("R1")),
    call("change", "c1", ok("R2")),
    fauxAssistantMessage(filler("Done.")),
  ] as const;

/** What the child reports once it is parked at its kill point. */
export type Parked = {
  readonly input: number;
  /** The prune write's submission, when the child admitted one before parking. */
  readonly submissions: readonly number[];
  /** Conversation requests the child's model answered. */
  readonly requests: number;
  readonly summaries: number;
};
