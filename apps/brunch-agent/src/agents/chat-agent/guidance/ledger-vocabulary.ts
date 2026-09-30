import type { LedgerVocabulary } from "@hashintel/brunch-agent";

/**
 * The identity Ledger's terms. The `ledger_commit` schema's kinds and
 * relations and the descriptions the model reads both derive from here.
 */
export const ledgerVocabulary = {
  title: "Operational model Ledger",
  kinds: [
    {
      name: "goal",
      description:
        "What the model should reveal or prove, or what the operation should achieve or maximise. Relate it with measures to what it is judged on.",
    },
    {
      name: "constraint",
      description:
        "A limit that must hold, or something to avoid or minimise. Relate it with limits to what it bounds.",
    },
    {
      name: "lever",
      description:
        "Something the person may change in pursuit of a goal. Relate it with adjusts to what it changes.",
    },
    {
      name: "actor",
      description: "A person, role or team that performs work or decides.",
    },
    {
      name: "resource",
      description:
        "Something work needs that may be limited: equipment, staff capacity, space, material.",
    },
    {
      name: "location",
      description: "A place whose purpose or connections matter.",
    },
    {
      name: "activity",
      description:
        "A logical step that takes inputs and possibly time, and has outcomes.",
    },
    {
      name: "thing",
      description:
        "Something that flows through the operation: an order, batch, lot, part or message.",
    },
  ],
  relations: [
    {
      name: "consumes",
      description: "An activity uses up or transforms an input.",
    },
    {
      name: "reserves",
      description:
        "An activity holds a resource while it runs and releases it afterwards.",
    },
    {
      name: "reads",
      description: "An activity needs an input that stays available to others.",
    },
    {
      name: "produces",
      description: "An activity yields an output or outcome.",
    },
    { name: "follows", description: "One activity happens after another." },
    {
      name: "triggers",
      description:
        "An arrival, schedule, threshold or event starts an activity.",
    },
    {
      name: "fails-into",
      description:
        "An activity's failure leads to another activity or outcome.",
    },
    { name: "performs", description: "An actor carries out an activity." },
    {
      name: "located-at",
      description: "Something is, or happens, at a location.",
    },
    { name: "measures", description: "A goal is judged on this." },
    { name: "limits", description: "A constraint bounds this." },
    { name: "adjusts", description: "A lever changes this." },
  ],
  fixed: [
    {
      name: "purpose",
      description:
        "The question or decision the model serves, for whom, its boundary and horizon, and what it must not claim.",
    },
  ],
} as const satisfies LedgerVocabulary;
