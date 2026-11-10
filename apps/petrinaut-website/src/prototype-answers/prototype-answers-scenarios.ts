/**
 * PROTOTYPE (FE-1594 review, throwaway): fixture turns for the quick-answer
 * design questions. Each is one user message and one assistant message whose
 * parts are shaped as the browser transport delivers them.
 */
import type { PetrinautAiMessage } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/types";

type Question =
  | { kind: "confirm"; label: string }
  | { kind: "choose"; label: string; options: string[] }
  | {
      kind: "values";
      label: string;
      fields: { label: string; unit?: string }[];
    }
  | { kind: "open"; label: string };

type Part = PetrinautAiMessage["parts"][number];

let nextId = 0;
const text = (body: string) =>
  ({ type: "text", text: body, state: "done" }) as unknown as Part;
const offer = (questions: Question[]) => {
  nextId += 1;
  return {
    type: "tool-offer_answers",
    toolCallId: `offer-${nextId}`,
    state: "output-available",
    input: { questions },
    output: { offered: questions.length },
  } as unknown as Part;
};
const rejectedOffer = (questions: Question[], errorText: string) => {
  nextId += 1;
  return {
    type: "tool-offer_answers",
    toolCallId: `offer-${nextId}`,
    state: "output-error",
    input: { questions },
    errorText,
  } as unknown as Part;
};

const quarantine: Question = {
  kind: "choose",
  label: "Quarantined shipment",
  options: ["Stays counted as open", "Drops out until released"],
};
const demand: Question = { kind: "confirm", label: "Production demand" };
const appetite: Question = {
  kind: "choose",
  label: "Time to spend",
  options: ["Quick", "Standard", "Thorough", "Deep"],
};
const recentCase: Question = { kind: "open", label: "Recent case" };

const quarantineAsk =
  "When a shipment is quarantined, does it stay counted as an open purchase order, or drop out until quality releases it?";
const demandAsk =
  "And production demand is fixed for the week once the plan is released; is that right?";
const recentCaseAsk =
  "Can you walk me through one recent Flowbind order, from reorder trigger to quarantine release?";
const appetiteAsk =
  "How much time do you want to spend on this now: Quick, Standard, Thorough or Deep?";

export type PrototypeScenario = {
  id: string;
  title: string;
  /** What to try, and what the open design question is. */
  watch: string;
  user: string;
  parts: Part[];
};

export const prototypeScenarios: PrototypeScenario[] = [
  {
    id: "single",
    title: "1. One closed question",
    watch:
      "Baseline. A click sends at once. Type something first, then click, to see what happens to your text (Keep typed text toggle).",
    user: "We quarantine Flowbind on arrival.",
    parts: [text(quarantineAsk), offer([quarantine])],
  },
  {
    id: "pair",
    title: "2. Two closed questions",
    watch: "Baseline. Clicks select; nothing is sent until Send answers.",
    user: "A batch sometimes waits for material.",
    parts: [
      text(`${quarantineAsk}\n\n${demandAsk}`),
      offer([quarantine, demand]),
    ],
  },
  {
    id: "mixed",
    title: "3. One open, one closed",
    watch:
      "Baseline. A click writes numbered lines into the composer; nothing is sent.",
    user: "I want to model Flowbind purchasing.",
    parts: [
      text(`${recentCaseAsk}\n\n${appetiteAsk}`),
      offer([recentCase, appetite]),
    ],
  },
  {
    id: "draft-partial",
    title: "4. One open, two closed: partial draft",
    watch:
      "Question 5. Click one answer, then send from the composer without filling the rest. Should the message say what is not answered yet?",
    user: "I want to model Flowbind purchasing.",
    parts: [
      text(`${recentCaseAsk}\n\n${appetiteAsk}\n\n${demandAsk}`),
      offer([recentCase, appetite, demand]),
    ],
  },
  {
    id: "reasked-open",
    title: "5. Two offers; the open question is asked again",
    watch:
      'Question 4, first reproduced fault. Under "As built", click Quick on the first card: it is sent at once, though Recent case still needs typing. Compare the other two variants.',
    user: "I want to model Flowbind purchasing.",
    parts: [
      text(`${recentCaseAsk}\n\n${appetiteAsk}`),
      offer([recentCase, appetite]),
      text(`To restate: ${recentCaseAsk}\n\n${demandAsk}`),
      offer([recentCase, demand]),
    ],
  },
  {
    id: "reasked-closed",
    title: "6. Two offers; a closed question is reworded",
    watch:
      'Question 4, second reproduced fault. Under "As built", click Yes on the first card: a bare "Yes" is sent at once and the other card disappears. Compare the other two variants.',
    user: "A batch sometimes waits for material.",
    parts: [
      text(`${quarantineAsk}\n\n${demandAsk}`),
      offer([quarantine, demand]),
      text(
        "Put more exactly: is a quarantined shipment counted as open, or out until released?",
      ),
      offer([
        { ...quarantine, options: ["Counted as open", "Out until released"] },
      ]),
    ],
  },
  {
    id: "different",
    title: "7. Two offers on different questions",
    watch:
      'Question 4. Your ruling: each keeps its card. Under "As built" a click on either card sends and the other disappears. "Last offer only" drops the first question\'s buttons.',
    user: "We quarantine Flowbind on arrival.",
    parts: [
      text(quarantineAsk),
      offer([quarantine]),
      text(demandAsk),
      offer([demand]),
    ],
  },
  {
    id: "reworded-label",
    title: "8. Two offers; the same question under a new label",
    watch:
      "Question 4's limit. A question is recognised by its label, so a reworded label shows as a second question in every variant.",
    user: "We quarantine Flowbind on arrival.",
    parts: [
      text(quarantineAsk),
      offer([quarantine]),
      text("Put more exactly: counted as open, or out until released?"),
      offer([
        {
          kind: "choose",
          label: "Quarantine status",
          options: ["Counted as open", "Out until released"],
        },
      ]),
    ],
  },
  {
    id: "values",
    title: "V1. Values alone",
    watch:
      'Free text in the composer: a values question has no fields on the card either. "Enter values…" writes a line to fill in. Compare with the fields as built.',
    user: "We reorder Flowbind at 1,500 units.",
    parts: [
      text(
        "For a useful test of the 1,500-unit trigger, what lower and higher reorder points would you consider realistic, in units?",
      ),
      offer([
        {
          kind: "values",
          label: "Reorder points",
          fields: [
            { label: "Lower", unit: "units" },
            { label: "Higher", unit: "units" },
          ],
        },
      ]),
    ],
  },
  {
    id: "values-pair",
    title: "V2. Values and a confirmation",
    watch:
      'Free text in the composer: click Yes, then "Enter values…". The Yes moves into the composer with the values line, and the message is sent from there.',
    user: "We reorder Flowbind at 1,500 units.",
    parts: [
      text(
        `${demandAsk}\n\nAnd what lower and higher reorder points would you test, in units?`,
      ),
      offer([
        demand,
        {
          kind: "values",
          label: "Reorder points",
          fields: [
            { label: "Lower", unit: "units" },
            { label: "Higher", unit: "units" },
          ],
        },
      ]),
    ],
  },
  {
    id: "long-option",
    title: "9. Options near today's 80-character cap",
    watch:
      "Question 2. How an option of 70 to 80 characters looks in a button today, before the label/value split.",
    user: "I want to model our pharmacy's refill process.",
    parts: [
      text(
        "Where should the model start and stop: from refill request arrival to ready for pickup, or through patient pickup including insurance problems?",
      ),
      offer([
        {
          kind: "choose",
          label: "Model boundary",
          options: [
            "From refill request arrival to ready for pickup, leaving out insurance",
            "From refill request arrival through patient pickup, including insurance",
            "Only the pharmacist's verification step and what waits on it",
          ],
        },
      ]),
    ],
  },
  {
    id: "rejected",
    title: "10. An offer the server rejected",
    watch:
      "Question 8. The option is 98 characters, so the server refused the call. Nothing shows: no card, and no sign in the activity fold that an offer was tried.",
    user: "I want to model our pharmacy's refill process.",
    parts: [
      text(
        "Where should the model start and stop: from refill request arrival to ready for pickup, or through patient pickup?",
      ),
      rejectedOffer(
        [
          {
            kind: "choose",
            label: "Model boundary",
            options: [
              "From refill request arrival to ready for pickup, including insurance problems and prescriber calls",
              "Through patient pickup",
            ],
          },
        ],
        'Validation failed for tool "offer_answers":\n  - questions.0.options.0: must be at most 80 characters',
      ),
    ],
  },
];
