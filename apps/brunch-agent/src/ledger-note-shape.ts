import { brunchEnv, type LedgerNoteShape } from "@hashintel/brunch-agent";

/** Typed epistemic fields by default; `open` keeps a free-text disposition for comparison runs. */
export const selectLedgerNoteShape = (
  environment: NodeJS.ProcessEnv = process.env,
): LedgerNoteShape => {
  const value = environment[brunchEnv.ledgerNotes];
  if (value === undefined || value === "" || value === "typed") return "typed";
  if (value === "open") return "open";
  throw new Error(`Unsupported ${brunchEnv.ledgerNotes}: ${value}`);
};
