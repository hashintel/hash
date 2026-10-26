import type { FlowRunStatus } from "../graphql/api-types.gen.js";
import type { FlowRunEvent } from "./run-events.js";
import type { FlowDataSources } from "./types.js";

/**
 * The version of the run record format, on every line of a record. A change that a reader of the current version
 * can't read increments it; adding a kind of event or an optional field doesn't.
 */
export const flowRunRecordFormatVersion = 1;

/**
 * What a run's record says about the run as a whole, on its first line. Its inputs, outputs and failure are on its
 * `runStarted` and `runFinished` events.
 */
export type FlowRunRecordHeader = {
  workflowId: string;
  /** The run of the workflow the record is of. Resetting a run starts a new run, which writes its own record. */
  runId: string;
  /** The status of its `runFinished` event, once it has one. */
  status: FlowRunStatus;
  /** When this run started. A run started by a reset starts when it was reset. */
  startedAt: string;
  /** When the workflow's first run started, if this run was started by resetting an earlier one. */
  firstRunStartedAt?: string;
  /** When the run began executing, which is later than it started if it had a delay before executing. */
  executedAt?: string;
  closedAt?: string;
  /** The data sources the run's AI steps can use, for an AI flow run. */
  dataSources?: FlowDataSources;
};

/** A run's header and its events, in the order its history records them. */
export type FlowRunRecord = {
  header: FlowRunRecordHeader;
  events: FlowRunEvent[];
};

type FlowRunRecordLine = {
  formatVersion: typeof flowRunRecordFormatVersion;
} & (({ kind: "header" } & FlowRunRecordHeader) | FlowRunEvent);

/** A run's record as JSON Lines: its header, then one line for each event. */
export const serializeFlowRunRecord = ({
  header,
  events,
}: FlowRunRecord): string => {
  const lines: FlowRunRecordLine[] = [
    { formatVersion: flowRunRecordFormatVersion, kind: "header", ...header },
    ...events.map((event): FlowRunRecordLine => ({
      formatVersion: flowRunRecordFormatVersion,
      ...event,
    })),
  ];

  return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
};

export const parseFlowRunRecord = (text: string): FlowRunRecord => {
  const lines = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      const parsedLine = JSON.parse(line) as { formatVersion: unknown };

      if (parsedLine.formatVersion !== flowRunRecordFormatVersion) {
        throw new Error(
          `Line ${index + 1} of the flow run record has format version ${String(parsedLine.formatVersion)}, but only version ${flowRunRecordFormatVersion} can be read`,
        );
      }

      const { formatVersion: _formatVersion, ...content } =
        parsedLine as FlowRunRecordLine;

      return content;
    });

  const [headerLine, ...eventLines] = lines;

  if (headerLine?.kind !== "header") {
    throw new Error("The flow run record doesn't start with its header");
  }

  const { kind: _kind, ...header } = headerLine;

  return {
    header,
    events: eventLines.map((eventLine, index) => {
      if (eventLine.kind === "header") {
        throw new Error(
          `Line ${index + 2} of the flow run record is a second header`,
        );
      }

      return eventLine;
    }),
  };
};
