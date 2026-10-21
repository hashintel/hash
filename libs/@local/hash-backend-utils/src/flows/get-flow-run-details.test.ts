import { readdirSync, readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { getFlowRunDetailedFieldsFromHistory } from "./get-flow-run-details.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { FlowRunHistoryRecord } from "./get-flow-run-details.js";

const fixturesUrl = new URL(
  "../../tests/fixtures/flow-run-histories/",
  import.meta.url,
);

/**
 * What `getFlowRunDetailedFieldsFromHistory` returned on each fixture when it was split out of the Temporal reader,
 * or `{ throws }` with the message it threw.
 */
const recordedDetailsUrl = new URL(
  "../../tests/fixtures/flow-run-details/",
  import.meta.url,
);

const fixtureNames = readdirSync(fixturesUrl)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => fileName.replace(/\.json$/, ""));

/**
 * Resolves every stored payload to its own storage key, so outputs that reference stored payloads resolve
 * deterministically without S3.
 */
const storageProvider = {
  downloadDirect: ({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(JSON.stringify({ storageKey: key }))),
} as unknown as FileStorageProvider;

const loadFixture = (fixtureName: string): FlowRunHistoryRecord => {
  const { history, ...fixture } = JSON.parse(
    readFileSync(new URL(`${fixtureName}.json`, fixturesUrl), "utf8"),
  ) as Omit<FlowRunHistoryRecord, "history"> & {
    history: Record<string, unknown>;
  };

  return {
    ...fixture,
    history: proto.temporal.api.history.v1.History.fromObject(history).events,
  };
};

/* The recorder runs each case with its flow run's entity uuid as the workflow id. */
const workflowIdOf = ({ history }: FlowRunHistoryRecord) => {
  const [input] =
    history[0]?.workflowExecutionStartedEventAttributes?.input?.payloads ?? [];

  return (
    JSON.parse(input?.data?.toString() ?? "{}") as {
      flowRunEntityUuid: string;
    }
  ).flowRunEntityUuid;
};

describe("getFlowRunDetailedFieldsFromHistory", () => {
  it.each(fixtureNames)(
    "returns the recorded details for %s",
    async (fixtureName) => {
      const fixture = loadFixture(fixtureName);

      const details: unknown = await getFlowRunDetailedFieldsFromHistory(
        fixture,
        { storageProvider, workflowId: workflowIdOf(fixture) },
      ).catch((error: unknown) => ({ throws: (error as Error).message }));

      /* Compared as GraphQL sends it: as JSON, without `undefined` fields. */
      expect(JSON.parse(JSON.stringify(details))).toStrictEqual(
        JSON.parse(
          readFileSync(
            new URL(`${fixtureName}.json`, recordedDetailsUrl),
            "utf8",
          ),
        ),
      );
    },
  );
});
