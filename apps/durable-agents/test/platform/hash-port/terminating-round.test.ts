/**
 * H0b (i): fold 7's terminating round composes with the read-back pruning
 * write and a hand-edit note (`hash-agent-port.md` §3.8, "Pruning composes").
 *
 * The round that ends the turn has every call ask to terminate, as Pi
 * requires (`generation.js` `finishToolRound`). Pi still runs `afterTools`
 * for it, where the successor's real pruning hook admits its `brunch.prune`
 * write, and a hand-edit note reported through the successor's real
 * `reportHandEdit` while the round's commit is held is queued. Both must be
 * placed at the round's `final` boundary, once each, with no further model
 * request in that run; the next run's request must equal the committed
 * effective context (I1).
 *
 * A HASH round that ends the turn holds only `ledger_commit` (any other call
 * keeps the run going), and the round before it already pruned, so in
 * practice the terminating round's pruning write is empty. To make the
 * write non-empty here, the terminating round also holds a stand-in change
 * that asks to terminate, which no browser tool does.
 */
import { MemoryStorage } from "@earendil-works/pi-durable";
import { expect, test } from "vitest";

import { brunchTools, canonicalContent } from "@hashintel/brunch-agent";

import {
  pruneEntryKind,
  pruneRequestId,
  readBackPruningExtension,
} from "../../../src/agent/petrinaut-agent/read-back-pruning";
import { bindBrowserDocument } from "../../../src/browser-call/browser-call";
import { reportHandEdit } from "../../../src/browser-call/hand-edit";
import { mayShowNet } from "../../../src/net-state/net-view";
import {
  handEditEntryKind,
  renderHandEditNote,
} from "../../../src/net-state/visible-net-view";
import {
  allEntries,
  calls,
  context,
  fauxAssistantMessage,
  fauxToolCall,
  kindsOf,
  recordingModel,
  resultEntry,
  textOf,
} from "../support";
import {
  changeText,
  createPlace,
  createPlaceToolName,
  expectI1,
  heldCommitTool,
  netToolsExtension,
  openHarness,
  prunedChangeText,
} from "./support";

const binding = { conversationId: "conversation", documentId: "net-1" };

test("a terminating round's prune write and a hand-edit note queued during it land at the final boundary once each, and the next run's request is the committed context", async () => {
  // The stand-in is read as a net change, as the browser tool of that name is.
  expect(mayShowNet(createPlaceToolName)).toBe(true);
  const { models, model, requests } = recordingModel([
    calls([createPlaceToolName, "c0", createPlace("R0", "R1")]),
    // The reply, then a change and the commit, both asking to end the turn.
    fauxAssistantMessage(
      [
        { type: "text", text: "Added the dryer and the washer." },
        fauxToolCall(createPlaceToolName, createPlace("R1", "R2", true), {
          id: "c1",
        }),
        fauxToolCall(
          brunchTools.ledgerCommit,
          { endTurn: true },
          {
            id: "commit-1",
          },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Noted."),
  ]);
  const commit = heldCommitTool();
  const net = netToolsExtension(commit);
  const extensions = (host: Parameters<typeof readBackPruningExtension>[0]) => [
    net,
    readBackPruningExtension(host),
  ];
  const { harness, host } = await openHarness(
    new MemoryStorage(),
    models,
    extensions,
  );
  try {
    const root = await harness.root(context, {
      agent: { model, extensions: extensions(host) },
    });
    await harness.commit(
      (tx) => bindBrowserDocument(tx, root.id, binding),
      context,
    );

    await root.submit({ type: "input", content: "Add a washer." }, context);
    await commit.started;
    // The user edits by hand while the terminating round's commit is held.
    const note = await reportHandEdit(
      harness,
      root.id,
      {
        binding: canonicalContent(binding),
        episode: "episode-1",
        seq: 0,
        revision: "R3",
      },
      context,
    );
    expect(note).toMatchObject({ status: "admitted", placement: "queued" });
    commit.release();
    await root.waitForIdle(context);

    // The run ended at the terminating round: no request after it.
    expect(requests).toHaveLength(2);
    const entries = await allEntries(root);
    const terminating = entries.find(
      (entry) => kindsOf([entry])[0] === "pi.assistant(c1,commit-1)",
    );
    if (terminating === undefined) throw new Error("No terminating round.");
    // Both writes follow the round's last result, once each, and the run ended there.
    expect(kindsOf(entries).slice(-5)).toEqual([
      "pi.assistant(c1,commit-1)",
      "pi.tool-result(c1)",
      "pi.tool-result(commit-1)",
      handEditEntryKind,
      pruneEntryKind,
    ]);
    const prunes = entries.filter(({ kind }) => kind === pruneEntryKind);
    expect(prunes).toHaveLength(1);
    expect(prunes[0]?.data).toEqual({ assistant: terminating.id });
    // It prunes c0's read-back, the one the terminating round's change superseded.
    expect(prunes[0]?.edits?.map(({ target }) => target)).toEqual([
      resultEntry(entries, "c0")?.id,
    ]);
    expect(
      await harness.commit(
        (tx) => tx.submissionByRequest(root.id, pruneRequestId(terminating.id)),
        context,
      ),
    ).toBeDefined();
    expect(
      entries.filter(({ kind }) => kind === handEditEntryKind),
    ).toHaveLength(1);
    if (note.status !== "admitted") throw new Error("Not admitted.");
    expect(
      (
        await (
          await harness.submission(note.submission, context)
        )?.status(context)
      )?.status,
    ).toBe("done");

    // The next run.
    await root.submit({ type: "input", content: "Thanks." }, context);
    await root.waitForIdle(context);
    expect(requests).toHaveLength(3);
    const after = await allEntries(root);
    await expectI1(root, after, requests);
    // What the next request shows: c0 pruned, c1's read-back, the note once, then the user.
    const next = requests[2] ?? [];
    const results = Object.fromEntries(
      next.flatMap((message) =>
        message.role === "toolResult"
          ? [[message.toolCallId, textOf(message)]]
          : [],
      ),
    );
    expect(results.c0).toBe(prunedChangeText);
    expect(results.c1).toBe(changeText("R1", "R2"));
    expect(
      next.filter((message) => textOf(message) === renderHandEditNote("R3")),
    ).toHaveLength(1);
    expect(textOf(next.at(-1))).toBe("Thanks.");
  } finally {
    await harness.close(context);
  }
});
