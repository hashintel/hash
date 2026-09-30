import type { LedgerVocabulary } from "@hashintel/brunch-agent";

/**
 * The identity Ledger's terms. The `ledger_commit` schema's dimensions, kinds
 * and relations and the descriptions the model reads all derive from here.
 */
export const ledgerVocabulary = {
  title: "Operational model Ledger",
  dimensions: [
    {
      name: "goals",
      description:
        "What the model should reveal, prove or improve, and what it is judged on.",
      done: "the question the model answers has a measure the person confirmed",
    },
    {
      name: "limits",
      description:
        "Limits, maxima, minima or optima that must be preserved or found.",
      done: "each one is named and bounded, with its threshold or direction",
    },
    {
      name: "boundary",
      description:
        "What is inside and outside, what arrives from outside, the starting state and the horizon.",
      done: "inside and outside, the starting state and the horizon are agreed",
    },
    {
      name: "actors",
      description: "Who performs, decides or approves.",
      done: "who performs or decides each step is known",
    },
    {
      name: "resources",
      description:
        "Equipment, staff capacity, space, material and anything else work needs that may be limited.",
      done: "anything that limits capacity is named, with its capacity",
    },
    {
      name: "activities",
      description:
        "Steps and what flows through them, with their order, branching, waiting, failure and retry.",
      done: "each step's inputs, outputs and duration are known, and a case can be traced end to end, failures included",
    },
    {
      name: "quantities",
      description:
        "Durations, rates, counts, arrivals, probabilities and their variation.",
      done: "the quantities the goals depend on are pinned to their conditions",
    },
    {
      name: "policies",
      description: "Posted or practiced rules, exceptions and regimes.",
      done: "the rules that change the flow are stated, with their exceptions",
    },
    {
      name: "validation",
      description:
        "Observations, records or sources that could test the model.",
      done: "some observation exists that could test the model's answer",
    },
  ],
  kinds: [
    {
      name: "goal",
      description:
        "What the model should reveal or prove, or what the operation should achieve or maximise. Relate it with measures to what it is judged on.",
      covers: ["goals"],
    },
    {
      name: "constraint",
      description:
        "A limit, maximum, minimum or optimum to preserve or find: a capacity ceiling, a service level, a cost to minimise. Relate it with limits to what it bounds. A rule people follow is a rule; a disruption is an event.",
      covers: ["limits"],
    },
    {
      name: "lever",
      description:
        "Something the person may change in pursuit of a goal. Relate it with adjusts to what it changes.",
      covers: ["goals"],
    },
    {
      name: "actor",
      description: "A person, role or team that performs work or decides.",
      covers: ["actors"],
    },
    {
      name: "resource",
      description:
        "Something work needs that may be limited: equipment, staff capacity, space, material.",
      covers: ["resources"],
    },
    {
      name: "location",
      description: "A place whose purpose or connections matter.",
      covers: ["boundary"],
    },
    {
      name: "activity",
      description:
        "A logical step that takes inputs and possibly time, and has outcomes.",
      covers: ["activities"],
    },
    {
      name: "thing",
      description:
        "Something that flows through the operation: an order, batch, lot, part or message.",
      covers: ["activities"],
    },
    {
      name: "rule",
      description:
        "A posted or practiced rule that decides what happens or when: a reorder rule, an approval requirement, an exception.",
      covers: ["policies"],
    },
    {
      name: "event",
      description:
        "Something that happens to the operation rather than being done in it: an arrival, an outage, a delay, a failure.",
      covers: ["boundary", "quantities"],
    },
  ],
  relations: [
    {
      name: "consumes",
      description: "An activity uses up or transforms an input.",
      covers: ["activities"],
    },
    {
      name: "reserves",
      description:
        "An activity holds a resource while it runs and releases it afterwards.",
      covers: ["resources", "activities"],
    },
    {
      name: "reads",
      description: "An activity needs an input that stays available to others.",
      covers: ["activities"],
    },
    {
      name: "produces",
      description: "An activity yields an output or outcome.",
      covers: ["activities"],
    },
    {
      name: "follows",
      description: "One activity happens after another.",
      covers: ["activities"],
    },
    {
      name: "triggers",
      description:
        "An arrival, schedule, threshold or event starts an activity.",
      covers: ["activities", "boundary"],
    },
    {
      name: "fails-into",
      description:
        "An activity's failure leads to another activity or outcome.",
      covers: ["activities"],
    },
    {
      name: "performs",
      description: "An actor carries out an activity.",
      covers: ["actors"],
    },
    {
      name: "located-at",
      description: "Something is, or happens, at a location.",
      covers: ["boundary"],
    },
    {
      name: "governs",
      description: "A rule decides how or when an activity runs.",
      covers: ["policies"],
    },
    {
      name: "disrupts",
      description: "An event interrupts, delays or removes something.",
      covers: ["activities", "quantities"],
    },
    {
      name: "measures",
      description: "A goal is judged on this.",
      covers: ["goals"],
    },
    {
      name: "limits",
      description: "A constraint bounds this.",
      covers: ["limits"],
    },
    {
      name: "adjusts",
      description: "A lever changes this.",
      covers: ["goals"],
    },
  ],
  fixed: [
    {
      name: "purpose",
      description:
        "The question or decision the model serves, for whom, its boundary and horizon, and what it must not claim.",
    },
  ],
} as const satisfies LedgerVocabulary;
