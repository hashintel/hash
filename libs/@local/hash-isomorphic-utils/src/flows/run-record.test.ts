import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "../graphql/api-types.gen.js";
import { parseFlowRunRecord, serializeFlowRunRecord } from "./run-record.js";

import type { FlowRunRecord } from "./run-record.js";

const record: FlowRunRecord = {
  header: {
    workflowId: "workflow-id",
    runId: "run-id",
    status: FlowRunStatus.Completed,
    startedAt: "2026-10-23T09:00:00.000Z",
    closedAt: "2026-10-23T09:01:00.000Z",
  },
  events: [
    {
      kind: "runStarted",
      position: "1.0",
      occurredAt: "2026-10-23T09:00:00.000Z",
      flowInputs: {},
    },
    {
      kind: "runFinished",
      position: "9.0",
      occurredAt: "2026-10-23T09:01:00.000Z",
      status: FlowRunStatus.Completed,
    },
  ],
};

const toLines = (text: string) =>
  text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const fromLines = (lines: Record<string, unknown>[]) =>
  lines.map((line) => `${JSON.stringify(line)}\n`).join("");

describe("serializeFlowRunRecord", () => {
  it("writes the header, then each event, one per line, each with the format version", () => {
    expect(toLines(serializeFlowRunRecord(record))).toStrictEqual([
      { formatVersion: 1, kind: "header", ...record.header },
      ...record.events.map((event) => ({ formatVersion: 1, ...event })),
    ]);
  });
});

describe("parseFlowRunRecord", () => {
  it("rejects a line of another format version", () => {
    const [header, ...events] = toLines(serializeFlowRunRecord(record));

    expect(() =>
      parseFlowRunRecord(
        fromLines([header!, { ...events[0], formatVersion: 2 }]),
      ),
    ).toThrow("Line 2 of the flow run record has format version 2");
  });

  it("rejects a record that doesn't start with its header", () => {
    const [, ...events] = toLines(serializeFlowRunRecord(record));

    expect(() => parseFlowRunRecord(fromLines(events))).toThrow(
      "doesn't start with its header",
    );
    expect(() => parseFlowRunRecord("")).toThrow(
      "doesn't start with its header",
    );
  });

  it("rejects a second header", () => {
    const [header, ...events] = toLines(serializeFlowRunRecord(record));

    expect(() =>
      parseFlowRunRecord(fromLines([header!, ...events, header!])),
    ).toThrow("Line 4 of the flow run record is a second header");
  });
});
