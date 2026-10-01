import type { IdentityLedgerText } from "@hashintel/brunch-agent";

/**
 * What the Ledger tools say about their own arguments, and the headings of
 * the vocabulary in the commit tool's description.
 */
export const ledgerText: IdentityLedgerText = {
  fields: {
    identity:
      "A lowercase kebab-case identity name in the person's vocabulary, e.g. cleaning-crew.",
    kind: "Optional; leave it out until it is clear, and revise it by superseding.",
    covers:
      "The dimensions of the model this entry helps cover; each kind and relation suggests some.",
    identifyContent:
      "What is known about it. Omit for a bare placeholder: named, nothing known yet.",
    relateLabel: "Required when relation is other, e.g. 'available during'.",
    noteAbout:
      "The identities (by name) and relationships (by Note id, e.g. n12) this Note is about.",
    noteConcerns:
      "Set when the Note is about the net draft (a representation choice, stand-in, discrepancy or check) rather than the operation.",
    supersedeAddress: "The superseded Note's id, e.g. n7.",
    supersedeContent: "Omit to keep the superseded Note's content.",
    supersedeCovers: "Omit to keep the superseded Note's.",
  },
  epistemic: {
    source:
      "Who supplied this: the person, material they showed or cited, or the agent itself.",
    basis:
      "What it rests on: observed records or events, a documented rule, practiced judgment, an estimate, an assumption (by anyone), or the agent's inference.",
    standing:
      "settled: accepted as stated. tentative: held but hedged or unconfirmed. contested: two recorded accounts disagree. open: consequential and unknown, unasked or deferred. inapplicable: covered and judged not to apply to this model.",
    precision: "For quantities: approximate or only qualitative.",
    qualifier:
      "Short remaining qualification the fields cannot express, e.g. 'not site-validated'.",
  },
  vocabulary: {
    dimensions:
      "Dimensions (what the account must cover, and when each is done):",
    kinds:
      "Kinds (optional; revise by superseding the identity Note). Needs are what a finished identity of the kind has, met by a confirmed Note or relationship; a Note about the identity at inapplicable standing covering the need's dimension closes one that does not apply:",
    relations: "Relations (from -relation-> to; other takes a label):",
    fixed: "Fixed identities (exist from the start; use them in about):",
  },
  compile: {
    about:
      "Identity names or relationship Note ids (e.g. n12) to render in full.",
    revision:
      "A commit revision; 0 is the empty Ledger. Defaults to the latest.",
  },
};
