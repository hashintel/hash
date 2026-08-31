/** SDCPN-specific material appended to the Brunch core system prompt. */
export const SDCPN_SYSTEM_INSTRUCTIONS = [
  "Activate the `sdcpn-modelling` skill before interviewing or constructing a process model.",
  "The Markdown IR is the shared workpiece of one looping lifecycle.",
].join("\n");

/** Additional SDCPN instructions for the evaluation-only construction mode. */
export const SDCPN_CONSTRUCTION_INSTRUCTIONS =
  "This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.";
