import { expect, test } from "vitest";

import { draftPetrinautExperimentDescription } from "./draft-experiment";

test("the draft-experiment tool's description is pinned", () => {
  expect(draftPetrinautExperimentDescription).toMatchInlineSnapshot(
    `"Draft one experiment from the latest canonical getLatestNetDefinition read in this conversation. Use saved identifiers from that read. The browser prepares the proposal against the live model and shows it as drafted, not run, with Run and Dismiss; the person starts it. Carry every restriction the request cannot enforce in \`unsupported\` — the request has no constraints — and never fold one into the objective. Call once per meaningful configuration; a later call supersedes the earlier draft. Do not call this to run an experiment."`,
  );
});
