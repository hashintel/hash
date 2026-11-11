/**
 * PROTOTYPE (FE-1594, throwaway): fixture turns for questions docked on the
 * composer. A question carries a short label, a framing text, and options
 * that each have a short label and an optional longer value.
 */
export type DockOption = { label: string; value?: string };

export type DockQuestion = {
  /** A short name: heads the dock and the question's line in the sent text. */
  label: string;
  /** The framing text shown above the options. */
  preamble: string;
  /** Empty for a question answered only by typing. */
  options: DockOption[];
};

export type DockScenario = {
  id: string;
  title: string;
  watch: string;
  user: string;
  /** What the reply says before the questions. */
  lead: string;
  questions: DockQuestion[];
};

const boundary: DockQuestion = {
  label: "Model boundary",
  preamble: "Where should the model start and stop?",
  options: [
    {
      label: "Ready for pickup",
      value:
        "From refill request arrival to ready for pickup, leaving out insurance problems and prescriber calls",
    },
    {
      label: "Through pickup",
      value:
        "From refill request arrival through patient pickup, including the wait at the counter",
    },
    {
      label: "Verification only",
      value: "Only the pharmacist's verification step and what waits on it",
    },
  ],
};

const appetite: DockQuestion = {
  label: "Time to spend",
  preamble: "How much time do you want to spend on this now?",
  options: [
    {
      label: "Quick",
      value:
        "Quick: enough to sketch the process and expose the biggest unknowns",
    },
    {
      label: "Standard",
      value:
        "Standard: a first usable draft if the basic numbers are available",
    },
    {
      label: "Thorough",
      value: "Thorough: adds peak and quiet variation and exception paths",
    },
    { label: "Deep", value: "Deep: detailed process and edge cases" },
  ],
};

const demand: DockQuestion = {
  label: "Production demand",
  preamble:
    "So production demand is fixed for the week once the plan is released. Is that right?",
  options: [{ label: "Yes" }],
};

const quarantine: DockQuestion = {
  label: "Quarantined shipment",
  preamble:
    "When a shipment is quarantined, how is it counted until quality releases it?",
  options: [
    {
      label: "Stays open",
      value: "It stays counted as an open purchase order",
    },
    {
      label: "Drops out",
      value: "It drops out of the open orders until quality releases it",
    },
  ],
};

const recentCase: DockQuestion = {
  label: "Recent order",
  preamble:
    "Can you walk me through one recent Flowbind order, from reorder trigger to quarantine release?",
  options: [],
};

const purpose: DockQuestion = {
  label: "What to decide",
  preamble:
    "What should the Saturday staffing model help you decide or prove, in your terms?",
  options: [],
};

const reorderPoints: DockQuestion = {
  label: "Reorder points",
  preamble:
    "For a useful test of the 1,500-unit trigger, what lower and higher reorder points would you consider realistic, in units?",
  options: [],
};

export const dockScenarios: DockScenario[] = [
  {
    id: "one",
    title: "1. One question, options with longer values",
    watch:
      "The basic case. In the list form each option shows its label and its value; in the button form only the label fits.",
    user: "I want to model our pharmacy's refill process to decide Saturday staffing.",
    lead: "Good. One thing to settle first.",
    questions: [boundary],
  },
  {
    id: "confirm",
    title: "2. One confirmation",
    watch:
      'A read-back. With one generic "Other" for free text, a confirmation reads "Yes / Other". Is that right, or does it want "Not quite"?',
    user: "We plan production weekly.",
    lead: "Recorded.",
    questions: [demand],
  },
  {
    id: "two",
    title: "3. Two questions",
    watch:
      "The stepper. With single choice, picking an answer moves to the next question; the arrows go back. Nothing is sent until Send answers.",
    user: "A batch sometimes waits for material.",
    lead: "Recorded. Two things to check.",
    questions: [quarantine, demand],
  },
  {
    id: "three",
    title: "4. Three questions",
    watch:
      "A longer battery. Try answering only two and sending: the message names what is not answered yet.",
    user: "I want to model our pharmacy's refill process. Give me options where you can.",
    lead: "Good, we'll keep this tight. Three things first.",
    questions: [boundary, appetite, demand],
  },
  {
    id: "mixed",
    title: "5. One typed question, one with options",
    watch:
      "A question with no options is answered by typing. Compare where that typing happens under the two free-text settings.",
    user: "I want to model Flowbind purchasing.",
    lead: "Good. Two things first.",
    questions: [recentCase, appetite],
  },
  {
    id: "opening",
    title: "6. Opening: purpose, time, boundary",
    watch:
      "The opening as decided on 2026-11-10: the purpose stays typed, the other two get options.",
    user: "I want to model our pharmacy's refill process to decide how many pharmacists to staff on Saturdays. I'm short on time, so where you can, give me a few options to pick from.",
    lead: "Good, we'll keep this tight. I need three things first.",
    questions: [purpose, appetite, boundary],
  },
  {
    id: "numbers",
    title: "7. Numbers",
    watch:
      "A values question has no options in this model, so it is just a typed question. Is that enough, or do numbers want fields?",
    user: "We reorder Flowbind at 1,500 units.",
    lead: "Recorded.",
    questions: [reorderPoints],
  },
  {
    id: "long-labels",
    title: "8. Four options with labels near the 32-character cap",
    watch: "How long labels sit in each form, in a 400-pixel panel.",
    user: "Lost shipments happen a few times a year.",
    lead: "Recorded.",
    questions: [
      {
        label: "Reorder timing",
        preamble: "When a shipment is lost, when do you reorder?",
        options: [
          {
            label: "As soon as the loss is found",
            value: "We reorder as soon as the loss is discovered",
          },
          {
            label: "At the next MRP review",
            value: "We wait and reorder at the next MRP review",
          },
          {
            label: "After the carrier confirms",
            value:
              "We reorder only after confirming the loss with the supplier or carrier",
          },
          { label: "It varies case by case" },
        ],
      },
    ],
  },
];

/** The reply as it reads when it states every question in full. */
export const fullReply = ({ lead, questions }: DockScenario) =>
  [
    lead,
    ...questions.map(({ label, preamble, options }) =>
      [
        `**${label}.** ${preamble}`,
        ...options.map((option) =>
          // A value that opens with its own label already names the option.
          option.value === undefined
            ? `- ${option.label}`
            : option.value.startsWith(option.label)
              ? `- ${option.value}`
              : `- ${option.label}: ${option.value}`,
        ),
      ].join("\n"),
    ),
  ].join("\n\n");
