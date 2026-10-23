import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  foldCommits,
  type LedgerHistoryMessage,
} from "@hashintel/brunch-agent";

import { netSizeOf } from "./build-run-packet.ts";
import { parseChronologyLog } from "./parse-chronology-log.ts";

import type {
  FinalLedgerSummary,
  FinalNetSummary,
  RunMetadata,
  RunPacketInput,
  RunSubmission,
  StreamEvent,
} from "./build-run-packet.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const readJson = async (path: string): Promise<unknown> =>
  existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : undefined;

/**
 * Submissions and stream events from Flue's SQLite store. A batch too large
 * for one row is stored across `flue_conversation_stream_batch_chunks`.
 */
const readConversationDb = (
  path: string,
): {
  submissions: RunSubmission[];
  events: StreamEvent[];
  skippedBatches: number;
  skippedEvents: number;
} => {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const submissions = database
      .prepare(
        "select submission_id, accepted_at, settled_at from flue_agent_submissions where joined_into is null order by sequence",
      )
      .all()
      .map((row) => ({
        submissionId: String(row.submission_id),
        acceptedAt: Number(row.accepted_at),
        settledAt: row.settled_at === null ? null : Number(row.settled_at),
      }));
    const rows = database
      .prepare(
        `select batch.submission_id as submission_id,
                coalesce(
                  (select group_concat(chunk.data, '' order by chunk.chunk_index)
                     from flue_conversation_stream_batch_chunks as chunk
                    where chunk.path = batch.path and chunk.seq = batch.seq),
                  batch.data) as data
           from flue_conversation_stream_batches as batch
          where batch.submission_id is not null
          order by batch.path, batch.seq`,
      )
      .all();
    const events: StreamEvent[] = [];
    let skippedBatches = 0;
    let skippedEvents = 0;
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(row.data));
      } catch {
        skippedBatches += 1;
        continue;
      }
      for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
        if (
          !isRecord(event) ||
          typeof event.type !== "string" ||
          typeof event.timestamp !== "string"
        ) {
          skippedEvents += 1;
          continue;
        }
        events.push({
          type: event.type,
          at: Date.parse(event.timestamp),
          submissionId: String(row.submission_id),
          payload: event,
        });
      }
    }
    return { submissions, events, skippedBatches, skippedEvents };
  } finally {
    database.close();
  }
};

const readMetadata = async (directory: string): Promise<RunMetadata | null> => {
  const run = await readJson(join(directory, "run.json"));
  if (!isRecord(run)) return null;
  const persona = isRecord(run.personaAgent) ? run.personaAgent : {};
  const personaAgent = [
    persona.agent,
    persona.personaModel,
    persona.personaThinking,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" / ");
  return {
    caseName:
      typeof run.caseDirectory === "string"
        ? basename(run.caseDirectory)
        : null,
    brunchModel: stringOrNull(run.brunchModel),
    brunchThinking: stringOrNull(run.brunchThinking),
    personaAgent: personaAgent === "" ? null : personaAgent,
    guidanceSha256: isRecord(run.guidance)
      ? stringOrNull(run.guidance.sha256)
      : null,
    createdAt: stringOrNull(run.createdAt),
  };
};

const finalNetOf = (net: unknown): FinalNetSummary | null => {
  if (!isRecord(net) || !isRecord(net.sdcpn)) return null;
  const sdcpn = net.sdcpn;
  const size = netSizeOf({ output: { definition: sdcpn } });
  if (size === null) return null;
  const count = (key: string) => {
    const value = sdcpn[key];
    return Array.isArray(value) ? value.length : 0;
  };
  const places = Array.isArray(sdcpn.places) ? sdcpn.places : [];
  return {
    ...size,
    tokenTypes: count("types"),
    colouredPlaces: places.filter(
      (place) => isRecord(place) && typeof place.colorId === "string",
    ).length,
    parameters: count("parameters"),
    differentialEquations: count("differentialEquations"),
    metrics: count("metrics"),
    scenarios: count("scenarios"),
  };
};

const isHistoryMessage = (message: unknown): message is LedgerHistoryMessage =>
  isRecord(message) &&
  typeof message.id === "string" &&
  (message.role === "user" ||
    message.role === "assistant" ||
    message.role === "system") &&
  Array.isArray(message.parts);

const finalLedgerOf = (history: unknown): FinalLedgerSummary | null => {
  if (!isRecord(history) || !Array.isArray(history.messages)) return null;
  const { state, commits } = foldCommits({
    messages: history.messages.filter(isHistoryMessage),
  });
  return {
    acceptedCommits: commits.length,
    entities: state.entities.length,
    claims: state.claims.length,
    obligations: state.obligations.length,
  };
};

/**
 * Everything a packet reads from a persona run or turn-probe directory:
 * `conversation.db` (required), and when present `dev-brunch-server.log`,
 * `run.json`, `evidence/net.json`, and `evidence/snapshot.json` or
 * `history.json` for the final Ledger.
 */
export const readRunDirectory = async (
  directory: string,
): Promise<RunPacketInput> => {
  const databasePath = join(directory, "conversation.db");
  if (!existsSync(databasePath)) {
    throw new Error(`No conversation.db in ${directory}`);
  }
  const logPath = join(directory, "dev-brunch-server.log");
  const [metadata, log, net, snapshot, history] = await Promise.all([
    readMetadata(directory),
    existsSync(logPath) ? readFile(logPath, "utf8") : Promise.resolve(""),
    readJson(join(directory, "evidence", "net.json")),
    readJson(join(directory, "evidence", "snapshot.json")),
    readJson(join(directory, "history.json")),
  ]);
  const { submissions, events, skippedBatches, skippedEvents } =
    readConversationDb(databasePath);
  const { entries: chronology, skippedLines } = parseChronologyLog(log);
  return {
    label: basename(directory),
    metadata,
    submissions,
    events,
    chronology,
    skipped: {
      batches: skippedBatches,
      events: skippedEvents,
      chronologyLines: skippedLines,
    },
    finalLedger: finalLedgerOf(snapshot ?? history),
    finalNet: finalNetOf(net),
  };
};
