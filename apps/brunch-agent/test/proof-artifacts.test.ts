import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  deriveProofTrace,
  writeProofArtifacts,
} from "../src/evaluations/persona/proof-artifacts";

import type { FlueConversationSnapshot } from "@flue/sdk";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const snapshot: FlueConversationSnapshot = {
  v: 1,
  conversationId: "proof-conversation",
  offset: "9",
  messages: [
    {
      id: "user-1",
      role: "user",
      purpose: "user",
      display: "visible",
      parts: [{ type: "text", text: "Help me model this.", state: "done" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId: "submission-1",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "activate-job",
          toolName: "activate_skill",
          state: "output-available",
          input: { name: "sdcpn-modelling" },
          output: { ok: true },
        },
        {
          type: "dynamic-tool",
          toolCallId: "activate-capability",
          toolName: "activate_skill",
          state: "output-available",
          input: { name: "elicitation" },
          output: { ok: true },
        },
        {
          type: "dynamic-tool",
          toolCallId: "read-profile",
          toolName: "read_skill_resource",
          state: "output-available",
          input: {
            path: "/.flue/packaged-skills/skill%3Asdcpn-modelling%3Aabc/references/profile.md",
          },
          output: "profile",
        },
        {
          type: "text",
          text: "What happens when the alarm fires?",
          state: "done",
        },
        {
          type: "dynamic-tool",
          toolCallId: "read-filing",
          toolName: "read_skill_resource",
          state: "output-available",
          input: {
            path: "/.flue/packaged-skills/skill%3Asdcpn-modelling%3Aabc/references/ledger-filing.md",
          },
          output: "filing",
        },
        {
          type: "dynamic-tool",
          toolCallId: "commit-1",
          toolName: "ledger_commit",
          state: "output-available",
          input: {
            changes: [
              {
                op: "add",
                address: "purpose",
                content: "Model what happens when the alarm fires.",
                source: "person",
                standing: "settled",
              },
            ],
          },
          output: {
            status: "recorded",
            commitId: "commit-1",
            revision: 1,
            notes: [{ address: "purpose/n1" }],
          },
        },
        {
          type: "dynamic-tool",
          toolCallId: "client-doc",
          toolName: "readPetrinautDoc",
          state: "output-available",
          input: { doc: "simulation" },
          output: { brunchBrowserResult: true, output: "Petrinaut docs" },
        },
        {
          type: "dynamic-tool",
          toolCallId: "server-ping",
          toolName: "ping",
          state: "output-error",
          input: {},
          errorText: "not available",
        },
      ],
    },
  ],
  settlements: [{ submissionId: "submission-1", outcome: "completed" }],
};

test("derives canonical proof events in message and part order", () => {
  expect(deriveProofTrace(snapshot)).toEqual({
    conversationId: "proof-conversation",
    events: [
      {
        sequence: 1,
        type: "user",
        turn: 1,
        messageId: "user-1",
        text: "Help me model this.",
      },
      {
        sequence: 2,
        type: "activate",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "activate-job",
        name: "sdcpn-modelling",
        outcome: "ok",
      },
      {
        sequence: 3,
        type: "activate",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "activate-capability",
        name: "elicitation",
        outcome: "ok",
      },
      {
        sequence: 4,
        type: "read",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "read-profile",
        path: "sdcpn-modelling/references/profile.md",
        outcome: "ok",
      },
      {
        sequence: 5,
        type: "text",
        turn: 1,
        messageId: "assistant-1",
        text: "What happens when the alarm fires?",
      },
      {
        sequence: 6,
        type: "read",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "read-filing",
        path: "sdcpn-modelling/references/ledger-filing.md",
        outcome: "ok",
      },
      {
        sequence: 7,
        type: "tool",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "commit-1",
        name: "ledger_commit",
        executor: "server",
        outcome: "ok",
      },
      {
        sequence: 8,
        type: "tool",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "client-doc",
        name: "readPetrinautDoc",
        executor: "client",
        outcome: "ok",
      },
      {
        sequence: 9,
        type: "tool",
        turn: 1,
        messageId: "assistant-1",
        toolCallId: "server-ping",
        name: "ping",
        executor: "server",
        outcome: "error",
      },
    ],
  });
});

test("retains malformed resource paths in an error trace", () => {
  const malformedPath = "/.flue/packaged-skills/skill%/references/profile.md";
  const malformedSnapshot = {
    ...snapshot,
    messages: [
      ...snapshot.messages,
      {
        id: "assistant-2",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "submission-2",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "read-malformed",
            toolName: "read_skill_resource",
            state: "output-error",
            input: { path: malformedPath },
            errorText: "invalid path",
          },
        ],
      },
    ],
  } as FlueConversationSnapshot;

  expect(deriveProofTrace(malformedSnapshot).events).toContainEqual(
    expect.objectContaining({
      type: "read",
      path: malformedPath,
      outcome: "error",
    }),
  );
});

test("atomically writes the canonical snapshot and its derived projections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brunch-proof-"));
  temporaryDirectories.push(directory);

  await writeFile(
    join(directory, "run.json"),
    `${JSON.stringify({ attemptId: "attempt-1", slot: "probe" })}\n`,
  );
  await writeProofArtifacts(directory, snapshot);

  const [
    snapshotJson,
    transcript,
    traceJson,
    traceMarkdown,
    ledger,
    ledgerJson,
    manifestJson,
  ] = await Promise.all([
    readFile(join(directory, "snapshot.json"), "utf8"),
    readFile(join(directory, "transcript.md"), "utf8"),
    readFile(join(directory, "trace.json"), "utf8"),
    readFile(join(directory, "trace.md"), "utf8"),
    readFile(join(directory, "ledger.md"), "utf8"),
    readFile(join(directory, "ledger.json"), "utf8"),
    readFile(join(directory, "manifest.json"), "utf8"),
  ]);

  expect(JSON.parse(snapshotJson)).toEqual(snapshot);
  expect(transcript).toContain("Help me model this.");
  expect(transcript).toContain("tool activate_skill");
  expect(JSON.parse(traceJson)).toEqual(deriveProofTrace(snapshot));
  expect(traceMarkdown).toContain("2. turn 1: `activate(sdcpn-modelling, ok)`");
  expect(traceMarkdown).toContain(
    "7. turn 1: `tool(ledger_commit, server, ok)` — call `commit-1`",
  );
  expect(ledger).toContain("[n1 — person; settled] `purpose/n1`");
  expect(ledger).toContain("Model what happens when the alarm fires.");
  expect(JSON.parse(ledgerJson)).toMatchObject([
    { commitId: "commit-1", revision: 1, afterMessageId: "user-1" },
  ]);

  const manifest = JSON.parse(manifestJson) as {
    files: { path: string; sha256: string }[];
  };
  expect(manifest.files.map(({ path }) => path)).toEqual([
    "ledger.json",
    "ledger.md",
    "run.json",
    "snapshot.json",
    "trace.json",
    "trace.md",
    "transcript.md",
  ]);
  const snapshotEntry = manifest.files.find(
    ({ path }) => path === "snapshot.json",
  );
  expect(snapshotEntry?.sha256).toBe(
    createHash("sha256").update(snapshotJson).digest("hex"),
  );
});
