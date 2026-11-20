import { describe, expect, test, vi } from "vitest";

import {
  brunchSignals,
  brunchTools,
  durableHistoryPartTypes,
  foldCommits,
  latestLedgerTurnId,
  ledgerCommentsMessage,
} from "@hashintel/brunch-agent";

import { showLedgerComments } from "../../ui/ledger/brunch-ledger-comment-messages";
import { BrunchPanelConversationTracker } from "../brunch-panel-transport";
import { reopenSuccessorConversation } from "./successor-conversation-state";

import type { UIMessage } from "ai";

const dryer = {
  name: "Dryer",
  kind: "resource",
  origin: "stated",
  status: "confirmed",
};
const comments = [{ id: "n1", records: ["e1"], text: "It is a tumble dryer." }];

/** A `ledger_commit` part as the durable server's history shows one: static, run by the server. */
const commitPart = (
  toolCallId: string,
  entries: unknown[],
  ids: string[],
  revision: number,
) => ({
  type: `tool-${brunchTools.ledgerCommit}`,
  toolCallId,
  state: "output-available",
  input: { entries },
  output: { status: "recorded", commitId: toolCallId, revision, ids },
  providerExecuted: true,
});

const note = (reportId: string): UIMessage => ({
  id: `brunch.hand-edit:${reportId}`,
  role: "user",
  parts: [
    {
      type: durableHistoryPartTypes.handEdit,
      id: `note-${reportId}`,
      data: { reportId, revision: "rev-2" },
    },
  ],
});

/** Two turns, a commit each, as `GET /chat/:id/messages` answers them. */
const history: UIMessage[] = [
  {
    id: "req-1",
    role: "user",
    parts: [{ type: "text", text: "Model a dryer.", state: "done" }],
  },
  {
    id: "durable:2",
    role: "assistant",
    parts: [
      { type: "step-start" },
      commitPart("commit-1", [["entity/create", dryer]], ["e1"], 1),
      { type: "text", text: "Recorded the dryer.", state: "done" },
    ] as UIMessage["parts"],
  },
  note("report-1"),
  {
    id: "req-2",
    role: "user",
    parts: [
      { type: durableHistoryPartTypes.ledgerComments, data: { comments } },
    ],
  },
  {
    id: "durable:6",
    role: "assistant",
    parts: [
      commitPart(
        "commit-2",
        [
          [
            "claim/create",
            {
              text: "The dryer tumbles.",
              entities: ["e1"],
              origin: "stated",
              status: "confirmed",
              resolves: ["n1"],
            },
          ],
        ],
        ["c1"],
        2,
      ),
      { type: "text", text: "Noted.", state: "done" },
    ] as UIMessage["parts"],
  },
  note("report-2"),
];

const reopen = (
  messages: readonly UIMessage[],
  options: Partial<Parameters<typeof reopenSuccessorConversation>[1]> = {},
) =>
  reopenSuccessorConversation(messages, {
    conversationId: "conversation-1",
    ...options,
  });

describe("reopenSuccessorConversation", () => {
  test("folds the history to the Ledger its commits recorded, with comments as a turn and notes as none", () => {
    const { snapshot } = reopen(history);

    const folded = foldCommits(snapshot);
    expect(folded.rejected).toEqual([]);
    expect(folded.commits.map(({ commitId }) => commitId)).toEqual([
      "commit-1",
      "commit-2",
    ]);
    expect(folded.state.turns).toEqual([
      { id: "req-1", excerpt: "Model a dryer." },
      { id: "req-2", excerpt: "It is a tumble dryer." },
    ]);
    expect(folded.state.entities).toMatchObject([
      { address: "e1", name: "Dryer", turn: "req-1" },
    ]);
    expect(folded.state.claims).toMatchObject([
      { address: "c1", turn: "req-2" },
    ]);
    expect(folded.state.comments).toMatchObject([
      { id: "n1", turn: "req-2", resolvedBy: "c1" },
    ]);
    expect(latestLedgerTurnId(snapshot)).toBe("req-2");
  });

  test("gives each message the purpose, signal and submission Flue's snapshot would, with every tool part dynamic", () => {
    const { snapshot } = reopen(history);

    expect(snapshot.conversationId).toBe("conversation-1");
    expect(
      snapshot.messages.map(({ id, role, purpose, display, submissionId }) => ({
        id,
        role,
        purpose,
        display,
        submissionId,
      })),
    ).toEqual([
      {
        id: "req-1",
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId: "req-1",
      },
      {
        id: "durable:2",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "req-1",
      },
      {
        id: "brunch.hand-edit:report-1",
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        submissionId: undefined,
      },
      {
        id: "req-2",
        role: "system",
        purpose: "dispatch",
        display: "visible",
        submissionId: "req-2",
      },
      {
        id: "durable:6",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "req-2",
      },
      {
        id: "brunch.hand-edit:report-2",
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        submissionId: undefined,
      },
    ]);
    expect(snapshot.messages[3]).toMatchObject({
      signal: { tagName: brunchSignals.ledgerComments },
      parts: [{ type: "text", text: ledgerCommentsMessage(comments).body }],
    });
    expect(snapshot.messages[1]?.parts).toEqual([
      {
        type: "dynamic-tool",
        toolName: brunchTools.ledgerCommit,
        toolCallId: "commit-1",
        state: "output-available",
        input: { entries: [["entity/create", dryer]] },
        output: {
          status: "recorded",
          commitId: "commit-1",
          revision: 1,
          ids: ["e1"],
        },
      },
      { type: "text", text: "Recorded the dryer.", state: "done" },
    ]);
  });

  test("settles a turn by its outcome, a later turn, or the ending the panel saw, and leaves a turn that may run unsettled", () => {
    const turns: UIMessage[] = [
      { id: "req-1", role: "user", parts: [{ type: "text", text: "One." }] },
      {
        id: "durable:2",
        role: "assistant",
        parts: [{ type: "text", text: "Answered." }],
      },
      // Ended before any output: nothing marks it, but the turn after it ran.
      { id: "req-3", role: "user", parts: [{ type: "text", text: "Two." }] },
      { id: "req-4", role: "user", parts: [{ type: "text", text: "Three." }] },
      {
        id: "durable:5",
        role: "assistant",
        parts: [{ type: "text", text: "Stopp" }],
        metadata: { stopped: true },
      },
      {
        id: "req-6",
        role: "user",
        parts: [{ type: "text", text: "Queued, then withdrawn." }],
        metadata: { withdrawn: "stopped" },
      },
      { id: "req-7", role: "user", parts: [{ type: "text", text: "Four." }] },
      {
        id: "durable:8",
        role: "assistant",
        parts: [{ type: "text", text: "Fail" }],
        metadata: { failed: true },
      },
      {
        id: "req-9",
        role: "user",
        parts: [{ type: "text", text: "Behind a failure." }],
        metadata: { withdrawn: "failed" },
      },
      { id: "req-10", role: "user", parts: [{ type: "text", text: "Five." }] },
      {
        id: "durable:11",
        role: "assistant",
        parts: [{ type: "text", text: "Still going" }],
      },
    ];

    expect(reopen(turns).snapshot.settlements).toEqual([
      { submissionId: "req-1", outcome: "completed" },
      { submissionId: "req-3", outcome: "failed" },
      { submissionId: "req-4", outcome: "aborted" },
      { submissionId: "req-6", outcome: "aborted" },
      { submissionId: "req-7", outcome: "failed" },
      { submissionId: "req-9", outcome: "failed" },
    ]);
    // The ending the panel saw, by the request it sent or the response it followed.
    expect(
      reopen(turns, {
        endings: new Map([["req-10", "completed"]] as const),
      }).snapshot.settlements.at(-1),
    ).toEqual({ submissionId: "req-10", outcome: "completed" });
    expect(
      reopen(turns, {
        endings: new Map([["durable:11", "aborted"]] as const),
      }).snapshot.settlements.at(-1),
    ).toEqual({ submissionId: "req-10", outcome: "aborted" });
  });

  test("lets the panel follow the history once every turn it sent has settled and been answered", () => {
    const tracker = new BrunchPanelConversationTracker();
    tracker.recordAdmission({
      admission: { submissionId: "req-1" },
      kind: "user",
      messageId: "req-1",
    });
    const sent: UIMessage = {
      id: "req-1",
      role: "user",
      parts: [{ type: "text", text: "One." }],
    };
    const answered: UIMessage = {
      id: "durable:2",
      role: "assistant",
      parts: [{ type: "text", text: "Answered." }],
    };

    // Running: the history has its words, and maybe some of its answer.
    expect(tracker.hasUnsettledTurn(reopen([sent]).snapshot)).toBe(true);
    expect(tracker.canReplaceMessages(reopen([sent, answered]).snapshot)).toBe(
      false,
    );
    // Ended, as its stream said, but read before its answer was.
    const ended = new Map([["req-1", "completed"]] as const);
    expect(
      tracker.canReplaceMessages(reopen([sent], { endings: ended }).snapshot),
    ).toBe(false);
    const settled = reopen([sent, answered], { endings: ended }).snapshot;
    expect(tracker.hasUnsettledTurn(settled)).toBe(false);
    expect(tracker.canReplaceMessages(settled)).toBe(true);
  });

  test("shows the panel the user's words, comments as it sent them, and each response's ending, without notes", () => {
    const withEndings: UIMessage[] = [
      ...history,
      {
        id: "req-8",
        role: "user",
        parts: [{ type: "text", text: "Again." }],
        metadata: { versionLoad: { id: "v1", decisionTime: "2026-11-20" } },
      },
      {
        id: "durable:9",
        role: "assistant",
        parts: [{ type: "text", text: "Stopp" }],
        metadata: { stopped: true },
      },
      {
        id: "req-10",
        role: "user",
        parts: [{ type: "text", text: "Queued." }],
        metadata: { withdrawn: "failed" },
      },
      {
        id: "req-11",
        role: "user",
        parts: [{ type: "text", text: "Queued too." }],
        metadata: { withdrawn: "stopped" },
      },
    ];

    const { messages } = reopen(withEndings);

    expect(
      messages.map(({ id, role, metadata }) => ({ id, role, metadata })),
    ).toEqual([
      { id: "req-1", role: "user", metadata: undefined },
      { id: "durable:2", role: "assistant", metadata: undefined },
      { id: "req-2", role: "user", metadata: { ledgerComments: true } },
      { id: "durable:6", role: "assistant", metadata: undefined },
      { id: "req-8", role: "user", metadata: undefined },
      { id: "durable:9", role: "assistant", metadata: { stopped: true } },
      { id: "req-10", role: "user", metadata: undefined },
      { id: "withdrawn:req-10", role: "assistant", metadata: { failed: true } },
      { id: "req-11", role: "user", metadata: undefined },
      {
        id: "withdrawn:req-11",
        role: "assistant",
        metadata: { stopped: true },
      },
    ]);
    expect(messages[2]?.parts).toEqual([
      { type: "text", text: ledgerCommentsMessage(comments).body },
    ]);
    expect(showLedgerComments([messages[2]!])[0]?.parts).toEqual([
      {
        type: "text",
        text: "Comments on the Ledger\nIt is a tumble dryer.",
      },
    ]);
    // The response keeps its parts as the live stream showed them.
    expect(messages[1]?.parts).toEqual(history[1]?.parts);
    expect(messages[7]?.parts).toEqual([]);
  });

  test("reports metadata it cannot read and reads the message as having none", () => {
    const onInvalidMetadata = vi.fn();
    const { messages, snapshot } = reopen(
      [
        {
          id: "req-1",
          role: "user",
          parts: [{ type: "text", text: "One." }],
          metadata: { withdrawn: "vanished" },
        },
      ],
      { onInvalidMetadata },
    );

    expect(onInvalidMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "req-1" }),
    );
    expect(messages).toHaveLength(1);
    expect(snapshot.settlements).toEqual([]);
  });
});
