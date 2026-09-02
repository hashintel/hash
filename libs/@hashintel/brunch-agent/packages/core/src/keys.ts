/**
 * The keys of plugin authoring (ADR-0007).
 *
 * Every key is owned by the harness: the harness defines the concept the key
 * names, teaches it through the repertoire's default, and a plugin specialises
 * it in a cell written in the harness's terms. This file is the catalogue —
 * which keys exist, in which group, working through which mechanism, and the
 * one-paragraph definition the interviewer reads above every rendered key.
 *
 * The catalogue is a working set until a co-authoring cycle changes no key
 * (ADR-0007 decision 9). Changes are recorded in `schema/CHANGELOG.md`, beside
 * the JSON schema derived from `plugin-definition.ts`.
 */

/** The jobs the harness names without any plugin (ADR-0007 decision 4). */
export const JOBS = ["construct", "review-and-revise"] as const;
export type Job = (typeof JOBS)[number];

/** Guidance keys, in the order they render. Each works through one mechanism. */
export const GUIDANCE_KEYS = [
  "lenses",
  "techniques",
  "movements",
  "licenses",
  "motifs",
  "smells",
  "rabbit_holes",
  "failure_modes",
] as const;
export type GuidanceKey = (typeof GUIDANCE_KEYS)[number];

/** The two movements a `movements` cell distinguishes. */
export const MOVEMENTS = ["slice", "sweep"] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** Runbook keys — the only keys that carry procedure — in the order they render. */
export const RUNBOOK_KEYS = ["kickoff", "trajectory", "close"] as const;
export type RunbookKey = (typeof RUNBOOK_KEYS)[number];

/**
 * How a guidance key works on the interviewer (ADR-0007 decision 3): a license
 * permits a move a cooperative model suppresses; a technique supplies a method
 * the model does not reliably apply; attention points native ability at a
 * target; an anchor holds leading words for judgment.
 */
export type MechanismType = "license" | "technique" | "attention" | "anchor";

export interface KeyDescription {
  readonly key: GuidanceKey | RunbookKey;
  readonly title: string;
  readonly mechanism: MechanismType | "procedure";
  /** What the harness defines the key to mean — rendered above every key. */
  readonly definition: string;
}

export const GUIDANCE_KEY_DESCRIPTIONS: Readonly<
  Record<GuidanceKey, KeyDescription>
> = {
  lenses: {
    key: "lenses",
    title: "Lenses",
    mechanism: "attention",
    definition:
      "What to attend to in the expert's talk: the interview situations the harness can name — conflict, competing alternatives, ambiguity, weak or missing evidence, clusters of absence, pressure at a choice point — and where the formalism's kinds hide in ordinary speech. A lens says what something looks like when it appears and what to do then; it never says what to ask next.",
  },
  techniques: {
    key: "techniques",
    title: "Techniques",
    mechanism: "technique",
    definition:
      "Question forms that deepen one answer already given. A technique is applied to a thread, one at a time, when the answer in hand is not yet usable; it is never a schedule of questions.",
  },
  movements: {
    key: "movements",
    title: "Movements",
    mechanism: "technique",
    definition:
      "The two shapes a stretch of interview takes. A slice walks one concrete case end to end and is where the model's structure comes from. A sweep makes one property hold across one stratum and is what finds what was never asked. The completion report is the map of what is unknown, never the order to ask in.",
  },
  licenses: {
    key: "licenses",
    title: "Licenses",
    mechanism: "license",
    definition:
      "Moves the interviewer is permitted to make that a cooperative model would otherwise suppress. A license says what is allowed and the limit of the allowance; it never obliges.",
  },
  motifs: {
    key: "motifs",
    title: "Motifs",
    mechanism: "attention",
    definition:
      "Recurring shapes the formalism knows — offered as scaffolds for a question, never as a catalogue to assemble structure from. The interviewer asks whether a motif is present and with what parameters; it never generates a model from the motif.",
  },
  smells: {
    key: "smells",
    title: "Smells",
    mechanism: "attention",
    definition:
      "Signs in the interviewer's own output — not the expert's — that the interview has gone wrong. Each names what to look for in what was just said or recorded.",
  },
  rabbit_holes: {
    key: "rabbit_holes",
    title: "Rabbit holes",
    mechanism: "anchor",
    definition:
      "Where not to dig, and what looks like progress and is not. Anti-guidance, kept here so that every other key can be stated positively.",
  },
  failure_modes: {
    key: "failure_modes",
    title: "Failure modes",
    mechanism: "anchor",
    definition:
      "Named ways an interview of this kind fails, each with the signature by which it is detected. The failures this guidance exists to prevent; read them as judgments to check against, not as rules.",
  },
};

export const RUNBOOK_KEY_DESCRIPTIONS: Readonly<
  Record<RunbookKey, KeyDescription>
> = {
  kickoff: {
    key: "kickoff",
    title: "Kickoff",
    mechanism: "procedure",
    definition:
      "What to establish before any structure, and how. Kickoff produces a posture — the stance the rest of the interview takes from the expert's time, intended use, required confidence, and tolerance for proposed assumptions. It is a form the interviewer fills implicitly, never an opening battery of questions.",
  },
  trajectory: {
    key: "trajectory",
    title: "Trajectory",
    mechanism: "procedure",
    definition:
      "Which movements in which bias, varied by posture. Stated as postures the interviewer moves between, never as a state machine; the interviewer chooses among what applies.",
  },
  close: {
    key: "close",
    title: "Close",
    mechanism: "procedure",
    definition:
      "How to end honestly. Completion is computed by the harness from the model, never felt from the conversation; whether a session may stop is the harness's decision, not this key's. Close says what to say and deliver when the interview ends, complete or not.",
  },
};

export const JOB_TITLES: Readonly<Record<Job, string>> = {
  construct: "Job: construct — no model exists",
  "review-and-revise": "Job: review and revise — a model exists",
};
