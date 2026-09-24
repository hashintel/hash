import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { brunchSignals, brunchTools } from "@hashintel/brunch-agent";

import {
  createBrunchContextProjection,
  projectBrunchContext,
} from "../agents/chat-agent/context-projection.ts";

import type { ContextProjection, ContextProjectionEntry } from "@flue/runtime";

type CanonicalRecord = Record<string, unknown> & { type?: string };
type ReducedState = {
  recordsThroughOffset: string;
  conversations: Map<string, unknown>;
  conversationScopes: Map<string, string>;
  recordsById: Map<string, unknown>;
  state: Map<string, unknown>;
};
type RuntimeContextInternals = {
  st: (
    state: ReducedState,
    records: readonly CanonicalRecord[],
    offset: string,
  ) => ReducedState;
  rt: (
    conversation: unknown,
    options?: { contextProjection?: ContextProjection },
  ) => unknown[];
  it: (
    conversation: unknown,
    options: { renderSignals: false },
  ) => {
    message: ContextProjectionEntry["message"];
    sourceEntry: { id: string };
  }[];
};

const runtimeUrl = new URL(
  "./dispatch-nU3cIlT-.mjs",
  import.meta.resolve("@flue/runtime"),
);
// Flue has no public offline replay surface. This pinned private import uses
// the exact reducer/context builder that the installed runtime executes.
const runtime = (await import(runtimeUrl.href)) as RuntimeContextInternals;

const databasePath = process.argv[2];
assert(
  databasePath,
  "Usage: yarn workspace @apps/brunch-agent measure:context-replay <consistent conversation.db snapshot>",
);

const database = new DatabaseSync(resolve(databasePath), { readOnly: true });
const rows = database
  .prepare(
    "SELECT path, seq, data FROM flue_conversation_stream_batches ORDER BY path, seq",
  )
  .all() as { path: string; seq: number; data: string }[];
database.close();
assert(rows.length > 0, "Replay database contains no conversation batches.");
const paths = new Set(rows.map((row) => row.path));
assert.equal(
  paths.size,
  1,
  "Replay measurement requires one canonical agent-instance stream.",
);
const streamPath = [...paths].at(0);
assert(streamPath);

const emptyState = (): ReducedState => ({
  recordsThroughOffset: "-1",
  conversations: new Map(),
  conversationScopes: new Map(),
  recordsById: new Map(),
  state: new Map(),
});

const parseToolResult = (
  entry: ContextProjectionEntry,
): Record<string, unknown> | undefined => {
  if (
    entry.message.role !== "toolResult" ||
    entry.message.toolName !== brunchTools.mutateWorkpiece ||
    entry.message.isError
  )
    return undefined;
  const text = entry.message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const latestSettledRevision = (
  entries: readonly ContextProjectionEntry[],
): string | undefined =>
  entries
    .flatMap((entry) => {
      const output = parseToolResult(entry);
      return output &&
        typeof output.revisionId === "string" &&
        typeof output.sha256 === "string"
        ? [output.revisionId]
        : [];
    })
    .at(-1);

const clientResultSignalMeasurements = (
  entries: readonly ContextProjectionEntry[],
) => {
  const projected = projectBrunchContext(entries);
  return entries.flatMap((entry, index) => {
    if (
      entry.message.role !== "signal" ||
      entry.message.type !== brunchSignals.clientToolResult
    ) {
      return [];
    }
    const projectedEntry = projected[index];
    if (projectedEntry?.message.role !== "signal") return [];
    let toolNames: string[] = [];
    try {
      const parsed: unknown = JSON.parse(entry.message.content);
      if (Array.isArray(parsed)) {
        toolNames = parsed.flatMap((member: unknown) =>
          typeof member === "object" &&
          member !== null &&
          "toolName" in member &&
          typeof member.toolName === "string"
            ? [member.toolName]
            : [],
        );
      }
    } catch {
      // Malformed signals stay unprojected and are still measured as such.
    }
    return [
      {
        entryId: entry.id,
        toolNames,
        beforeCharacters: entry.message.content.length,
        defaultProjectionCharacters: projectedEntry.message.content.length,
      },
    ];
  });
};

const argumentProjection = createBrunchContextProjection({
  projectSupersededWorkpieceArguments: true,
});
const steps: {
  step: number;
  throughBatchSequence: number;
  latestRevisionId?: string;
  beforeCharacters: number;
  defaultProjectionCharacters: number;
  argumentProjectionCharacters: number;
}[] = [];
const revisions: (typeof steps)[number][] = [];
let clientResultSignals: ReturnType<typeof clientResultSignalMeasurements> = [];
let state = emptyState();
let previousContext = "";
let previousRevisionId: string | undefined;

for (const row of rows) {
  const records = JSON.parse(row.data) as CanonicalRecord[];
  state = runtime.st(state, records, String(row.seq));
  const conversations = [...state.conversations.values()];
  if (conversations.length === 0) continue;
  assert.equal(
    conversations.length,
    1,
    "Replay measurement found more than one canonical conversation.",
  );
  const conversation = conversations.at(0);
  assert(conversation);
  const entries = runtime
    .it(conversation, { renderSignals: false })
    .map(({ message, sourceEntry }) => ({
      id: sourceEntry.id,
      message,
    }));
  const before = runtime.rt(conversation);
  const beforeJson = JSON.stringify(before);
  if (beforeJson === previousContext) continue;
  previousContext = beforeJson;
  const withDefaultProjection = runtime.rt(conversation, {
    contextProjection: projectBrunchContext,
  });
  const withArgumentProjection = runtime.rt(conversation, {
    contextProjection: argumentProjection,
  });
  clientResultSignals = clientResultSignalMeasurements(entries);
  const latestRevisionId = latestSettledRevision(entries);
  const measurement = {
    step: steps.length + 1,
    throughBatchSequence: row.seq,
    ...(latestRevisionId === undefined ? {} : { latestRevisionId }),
    beforeCharacters: beforeJson.length,
    defaultProjectionCharacters: JSON.stringify(withDefaultProjection).length,
    argumentProjectionCharacters: JSON.stringify(withArgumentProjection).length,
  };
  steps.push(measurement);
  if (
    latestRevisionId !== undefined &&
    latestRevisionId !== previousRevisionId
  ) {
    revisions.push(measurement);
    previousRevisionId = latestRevisionId;
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      databasePath: resolve(databasePath),
      streamPath,
      canonicalBatches: rows.length,
      retainedContextSteps: steps.length,
      revisions,
      clientResultSignals,
      clientResultSignalTotals: clientResultSignals.reduce(
        (totals, signal) => ({
          signals: totals.signals + 1,
          beforeCharacters: totals.beforeCharacters + signal.beforeCharacters,
          defaultProjectionCharacters:
            totals.defaultProjectionCharacters +
            signal.defaultProjectionCharacters,
        }),
        {
          signals: 0,
          beforeCharacters: 0,
          defaultProjectionCharacters: 0,
        },
      ),
      steps,
      claimBoundary:
        "Characters in canonically reduced and built model contexts. Historical defaults and canonical records are unchanged; argument projection is a default-off counterfactual pending WP-A.9.",
    },
    null,
    2,
  )}\n`,
);
