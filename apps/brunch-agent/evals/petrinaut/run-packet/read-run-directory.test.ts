import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, expect, test } from "vitest";

import { buildRunPacket } from "./build-run-packet.ts";
import { readRunDirectory } from "./read-run-directory.ts";
import { renderRunPacket } from "./render-run-packet.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

const createMinimalRunDirectory = async (runJson: Record<string, unknown>) => {
  const directory = await mkdtemp(join(tmpdir(), "TEST-run-packet-dir-"));
  directories.push(directory);
  const database = new DatabaseSync(join(directory, "conversation.db"));
  try {
    database.exec(`
      create table flue_agent_submissions (
        sequence integer primary key,
        submission_id text not null,
        accepted_at integer not null,
        settled_at integer,
        joined_into text
      );
      create table flue_conversation_stream_batches (
        path text not null,
        seq integer not null,
        submission_id text,
        data text not null
      );
      create table flue_conversation_stream_batch_chunks (
        path text not null,
        seq integer not null,
        chunk_index integer not null,
        data text not null
      );
    `);
  } finally {
    database.close();
  }
  await writeFile(join(directory, "run.json"), JSON.stringify(runJson));
  return directory;
};

test.each([
  {
    name: "scripted driver without a case",
    runJson: {
      brunchModel: "openai/gpt-6.1-sol",
      brunchThinking: "medium",
      personaDriver: {
        kind: "scripted",
        scriptPath: "/tmp/demo/smoke.json",
        scriptSha256: "abcdef0123456789deadbeef",
      },
    },
    expectedCase: null,
    expectedDriver: "scripted (smoke.json, abcdef012345)",
  },
  {
    name: "agent driver with model and thinking",
    runJson: {
      caseDirectory: "/cases/inventory-purchasing",
      personaDriver: {
        kind: "agent",
        agent: "pi",
        personaModel: "anthropic/claude-sonnet-4-6",
        personaThinking: "low",
      },
    },
    expectedCase: "inventory-purchasing",
    expectedDriver: "pi anthropic/claude-sonnet-4-6 low",
  },
  {
    name: "custom command driver",
    runJson: {
      caseDirectory: "/cases/inventory-purchasing",
      personaDriver: {
        kind: "command",
        agentCommand: "opencode run {prompt}",
      },
    },
    expectedCase: "inventory-purchasing",
    expectedDriver: "custom --agent-command",
  },
  {
    name: "external driver",
    runJson: {
      caseDirectory: "/cases/inventory-purchasing",
      personaDriver: { kind: "external" },
    },
    expectedCase: "inventory-purchasing",
    expectedDriver: "external",
  },
  {
    name: "legacy personaAgent fallback",
    runJson: {
      caseDirectory: "/cases/inventory-purchasing",
      personaAgent: {
        agent: "claude",
        personaModel: "sonnet-4-6",
      },
    },
    expectedCase: "inventory-purchasing",
    expectedDriver: "claude sonnet-4-6",
  },
  {
    name: "probe directory without persona driver",
    runJson: {
      brunchModel: "openai/gpt-6.1-sol",
    },
    expectedCase: null,
    expectedDriver: null,
  },
])(
  "reads run metadata and renders packet header for $name",
  async ({ runJson, expectedCase, expectedDriver }) => {
    const directory = await createMinimalRunDirectory(runJson);
    const input = await readRunDirectory(directory);
    expect(input.metadata).toMatchObject({
      caseName: expectedCase,
      personaDriver: expectedDriver,
    });
    const markdown = renderRunPacket(buildRunPacket(input));
    expect(markdown).toContain(`- Case: ${expectedCase ?? "–"}`);
    expect(markdown).toContain(`- Persona: ${expectedDriver ?? "–"}`);
  },
);
