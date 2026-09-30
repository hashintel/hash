import type { LedgerProfile } from "@hashintel/brunch-agent/ledger";

/** The operational-process categories core surrounds with its own. */
export const sdcpnLedgerProfile: LedgerProfile = {
  id: "sdcpn-operational-v1",
  title: "Operational-process Ledger",
  categories: [
    {
      path: "operational",
      title: "Operational account",
      description:
        "Cross-cutting operational context that does not belong more specifically below.",
    },
    {
      path: "operational/goals",
      title: "Goals, measures and constraints",
      description: "Objectives, measures, constraints and decision thresholds.",
    },
    {
      path: "operational/boundary",
      title: "Boundary and initial conditions",
      description:
        "Triggers, prerequisites, initial state, and what is inside or outside.",
    },
    {
      path: "operational/resources",
      title: "Participants, things and resources",
      description:
        "People, locations, flowing things, capacity, availability and resource roles.",
    },
    {
      path: "operational/activities",
      title: "Activities and resource use",
      description:
        "Local activity accounts: inputs, outputs, consumption, reservation and release.",
    },
    {
      path: "operational/process-spine",
      title: "Cases and process spine",
      description:
        "Bounded narrative cases: order, branching, waiting, failure, retry and outcomes. Reference other Notes rather than repeat their details.",
    },
    {
      path: "operational/quantities",
      title: "Time, quantities and variation",
      description:
        "Durations, rates, counts, arrivals, probabilities and their applicable conditions.",
    },
    {
      path: "operational/policies",
      title: "Policies and exceptions",
      description:
        "Posted or practiced rules, exceptions and contextual regimes.",
    },
    {
      path: "operational/validation",
      title: "Validation evidence and sources",
      description:
        "Observations or sources that could test the account; not a duplicate evidence warehouse.",
    },
    {
      path: "construction",
      title: "Construction notes",
      description:
        "Representation choices, defaults, approximations, losses and questions reopened by construction; do not invent target execution.",
    },
  ],
};
