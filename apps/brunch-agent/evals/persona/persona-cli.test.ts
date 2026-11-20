import { expect, test } from "vitest";

import { offeredQuestionsOf } from "./browser-turn.ts";
import {
  formatPersonaResult,
  personaCommandFromArguments,
  splitPersonaArguments,
} from "./persona-cli.ts";
import { encodePersonaRecord } from "./rpc-protocol.ts";

test("a message that begins with a dash is text, not an option", async () => {
  const { options, positionals } = splitPersonaArguments([
    "say",
    "-5",
    "degrees",
    "is",
    "too",
    "cold",
  ]);
  expect(options).toEqual([]);
  await expect(personaCommandFromArguments(positionals)).resolves.toEqual({
    type: "prompt",
    message: "-5 degrees is too cold",
  });
});

test("open takes no text and prints the opening it sent with Brunch's reply", async () => {
  const command = await personaCommandFromArguments(["open"]);
  expect(command).toEqual({ type: "open" });
  expect(
    formatPersonaResult(command, [
      { type: "response", command: "open", success: true },
      { type: "turn_start", message: "Hello." },
      { type: "assistant_message", text: "Tell me more." },
      { type: "turn_settled", outcome: "replied", submissionIds: ["sub_1"] },
    ]),
  ).toBe("You: Hello.\n\nBrunch: Tell me more.");
});

test("the CLI's own flags stay options on either side of the command", () => {
  expect(
    splitPersonaArguments(["--socket", "/tmp/bridge", "say", "hi", "--json"]),
  ).toEqual({
    options: ["--socket", "/tmp/bridge", "--json"],
    positionals: ["say", "hi"],
  });
  expect(splitPersonaArguments(["say", "--", "--json", "is text"])).toEqual({
    options: [],
    positionals: ["say", "--json", "is text"],
  });
  // An unknown option before the command still reaches parseArgs and fails.
  expect(splitPersonaArguments(["--verbose", "state"]).options).toEqual([
    "--verbose",
  ]);
});

test("answer keeps each argument as one question's answer, and a reply lists the questions to answer", async () => {
  const command = await personaCommandFromArguments([
    "answer",
    "Stays open",
    "",
    "About nine days, last time.",
  ]);
  expect(command).toEqual({
    type: "answer",
    answers: ["Stays open", "", "About nine days, last time."],
  });
  expect(
    formatPersonaResult(command, [
      { type: "response", command: "answer", success: true },
      { type: "turn_start", message: "1. Quarantined shipment: …" },
      {
        type: "assistant_message",
        text: "Recorded. Two more things.",
        questions: [
          {
            kind: "choose",
            label: "Reorder timing",
            text: "Reorder timing?",
            options: [
              { label: "At once", value: "We reorder as soon as it is found" },
              { label: "It varies" },
            ],
          },
          {
            kind: "values",
            label: "Reorder points",
            text: "Reorder points?",
            fields: [{ label: "Lower", unit: "units" }, { label: "Higher" }],
          },
          { kind: "open", label: "Recent order", text: "Recent order?" },
        ],
      },
      { type: "turn_settled", outcome: "replied", submissionIds: ["sub_2"] },
    ]),
  ).toBe(
    [
      "Recorded. Two more things.",
      "",
      'Brunch asks 3 questions on its message box. Answer them together with `answer`, one quoted argument each in this order, "" to skip one:',
      "1. Reorder timing: Reorder timing?",
      "   Pick one by its label, or answer in your own words:",
      "   - At once: We reorder as soon as it is found",
      "   - It varies",
      "2. Reorder points: Reorder points?",
      "   Give: Lower (units), Higher",
      "3. Recent order: Recent order?",
    ].join("\n"),
  );
});

test("a confirmation offer lists the dock's Yes option in JSON and printed replies", () => {
  const questions = offeredQuestionsOf(
    {
      v: 1,
      conversationId: "conversation",
      offset: "1",
      settlements: [{ submissionId: "sub_3", outcome: "completed" }],
      messages: [
        {
          id: "assistant",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          submissionId: "sub_3",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "offer",
              toolName: "offer_answers",
              state: "output-available",
              input: {
                questions: [
                  {
                    kind: "confirm",
                    label: "Production demand",
                    text: "Is demand fixed for the week?",
                  },
                ],
              },
              output: { ok: true },
            },
          ],
        },
      ],
    },
    ["sub_3"],
  );
  const reply = {
    type: "assistant_message",
    text: "One thing to check.",
    questions,
  } as const;
  const printed = formatPersonaResult(
    { type: "prompt", message: "We plan weekly." },
    [
      { type: "response", command: "prompt", success: true },
      reply,
      { type: "turn_settled", outcome: "replied", submissionIds: ["sub_3"] },
    ],
  );
  expect(printed).toContain("   - Yes");
  expect(printed).toContain(
    'Reply with `say`, or pick an option with `answer "<its label>"`',
  );
  expect(JSON.parse(encodePersonaRecord(reply))).toMatchObject({
    questions: [{ kind: "confirm", options: [{ label: "Yes" }] }],
  });
});

test("a turn's questions include those a continuation recorded under another submission", () => {
  const offer = (toolCallId: string, label: string) => ({
    type: "dynamic-tool" as const,
    toolCallId,
    toolName: "offer_answers",
    state: "output-available" as const,
    input: { questions: [{ kind: "open", label, text: `${label}?` }] },
    output: { ok: true },
  });
  const message = (
    id: string,
    purpose: "user" | "assistant",
    submissionId: string,
    parts: object[],
  ) => ({
    id,
    role: purpose,
    purpose,
    display: "visible" as const,
    submissionId,
    parts,
  });
  const questions = offeredQuestionsOf(
    {
      v: 1,
      conversationId: "conversation",
      offset: "1",
      settlements: [
        { submissionId: "sub_1", outcome: "completed" },
        { submissionId: "sub_2", outcome: "completed" },
      ],
      messages: [
        message("user", "user", "sub_1", [
          { type: "text", text: "We plan weekly." },
        ]),
        message("reply", "assistant", "sub_1", [offer("offer-1", "Demand")]),
        message("continuation", "user", "sub_2", []),
        message("more", "assistant", "sub_2", [offer("offer-2", "Supply")]),
      ],
    } as Parameters<typeof offeredQuestionsOf>[0],
    ["sub_1"],
  );
  expect(questions.map(({ label }) => label)).toEqual(["Demand", "Supply"]);
});
