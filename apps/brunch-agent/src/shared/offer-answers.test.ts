import { type FlueLogger } from "@flue/runtime";
import { expect, test, vi } from "vitest";

import {
  brunchTools,
  type LedgerHistory,
  neverOffer,
  questionKinds,
} from "@hashintel/brunch-agent";

import {
  createOfferAnswersTool,
  offerAnswersToolDescription,
} from "./offer-answers.ts";

const offer = {
  questions: [
    {
      kind: "choose" as const,
      label: "Quarantined shipment",
      options: ["Stays counted as open", "Drops out until released"],
    },
  ],
};
const offerPart = {
  type: "dynamic-tool",
  toolName: brunchTools.offerAnswers,
  toolCallId: "offer-1",
  state: "input-available",
  input: offer,
};
const commitPart = (input: object, toolCallId = "commit-1") => ({
  type: "dynamic-tool",
  toolName: brunchTools.ledgerCommit,
  toolCallId,
  state: "input-available",
  input: { entries: [], ...input },
});
const log = () => ({
  info: vi.fn<FlueLogger["info"]>(),
  warn: vi.fn<FlueLogger["warn"]>(),
  error: vi.fn<FlueLogger["error"]>(),
});

/** The tool's result over a history of one assistant response per turn. */
const runWith = async (...responses: (readonly unknown[])[]) => {
  const history: LedgerHistory = {
    messages: responses.flatMap((parts, index) => [
      { id: `turn-${index}`, role: "user" as const, parts: [] },
      { id: `response-${index}`, role: "assistant" as const, parts },
    ]),
  };
  const tool = createOfferAnswersTool(async () => history);
  const result = await tool.run({
    data: offer,
    toolCallId: "offer-1",
    log: log(),
  });
  if (typeof result !== "object") throw new Error("Expected an envelope.");
  return result;
};

test("the description gives the model every kind's use and every never rule", () => {
  for (const [kind, { use }] of Object.entries(questionKinds)) {
    expect(offerAnswersToolDescription).toContain(`${kind} ${use}`);
  }
  for (const rule of neverOffer) {
    expect(offerAnswersToolDescription).toContain(rule);
  }
  expect(offerAnswersToolDescription).toContain(brunchTools.ledgerCommit);
});

test("ends the batch only beside a closing commit in its own response", async () => {
  const reply = { type: "text", text: "Does it stay counted as open?" };
  await expect(
    runWith([reply, offerPart, commitPart({ endTurn: true })]),
  ).resolves.toEqual({ output: { offered: 1 }, terminate: true });
  expect(
    (await runWith([reply, offerPart, commitPart({ endTurn: false })]))
      .terminate,
  ).toBe(false);
  expect((await runWith([reply, offerPart, commitPart({})])).terminate).toBe(
    false,
  );
  expect((await runWith([reply, offerPart])).terminate).toBe(false);
  // A closing commit in an earlier response does not close this one.
  expect(
    (await runWith([reply, commitPart({ endTurn: true })], [reply, offerPart]))
      .terminate,
  ).toBe(false);
});
