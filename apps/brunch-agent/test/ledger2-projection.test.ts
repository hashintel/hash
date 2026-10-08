import { describe, expect, test } from "vitest";

import {
  opForAnswer,
  opForFeedback,
  projectLedger,
  renderLedgerMarkdown,
  resolveSelection,
  supportDeskLedger,
} from "../src/agents/chat-agent/guidance/manual/tools/ledger2/projection.ts";

const projection = projectLedger(supportDeskLedger);
const user = renderLedgerMarkdown(projection, "user");
const agent = renderLedgerMarkdown(projection, "agent");

test("the worked example renders the approved markdown structure", () => {
  expect(user).toMatchSnapshot("user skin");
  expect(agent).toMatchSnapshot("agent skin");
});

test("kind headings carry user labels; addresses stay out of the user skin", () => {
  expect(user).toMatch(/^### Purpose$/mu);
  expect(user).toMatch(/^### Aims$/mu);
  expect(user).not.toContain("`purpose`");
  expect(user).not.toContain("`e1`");
  expect(agent).toContain("### Purpose `purpose`");
  expect(agent).toContain("`c5`");
});

test("empty kinds and clusters render no heading", () => {
  expect(user).not.toContain("### Targets");
  expect(user).not.toContain("### People and devices");
});

test("superseded claims collapse under their successor, struck through", () => {
  expect(user).toContain(
    "~~About 45 calls an hour arrive during the peak.~~ \u2014 superseded",
  );
  const horizons = user.slice(user.indexOf("### Time spans"));
  expect(
    horizons.indexOf("The phone-system export shows about 50 calls"),
  ).toBeLessThan(horizons.indexOf("~~About 45 calls"));
});

test("open and conflicted claims become question cards; open ones take free text", () => {
  const openQuestions = user.slice(user.indexOf("## Open questions"));
  expect(openQuestions).toContain(
    "Is the current six one agent too many on the peak block?",
  );
  expect(openQuestions).toContain("- [ ] It holds");
  const openCard = openQuestions.slice(
    openQuestions.indexOf("Is there a pattern inside the two-hour block"),
  );
  expect(openCard.slice(0, openCard.indexOf(":::"))).not.toContain("- [ ]");
});

test("out-of-scope entities leave their kind section for the excluded list", () => {
  const measuresStart = user.indexOf("### Measures");
  expect(measuresStart).toBeGreaterThan(-1);
  const metrics = user.slice(
    measuresStart,
    user.indexOf("\n#", measuresStart + 1),
  );
  expect(metrics).not.toContain("Cost of an agent-hour");
  const excluded = user.slice(user.indexOf("## Excluded from the model"));
  expect(excluded).toContain("**Cost of an agent-hour**");
  expect(excluded).toContain("metric \u00b7");
});

test("a multi-entity claim repeats under each entity it references", () => {
  const matches = user.match(/Staffing is a whole number of agents/gu) ?? [];
  expect(matches.length).toBe(2);
});

describe("parked commenting flow", () => {
  test("a partial selection resolves to its record and translates to a route op", () => {
    const resolved = resolveSelection(
      projection.addressEntries,
      "Callers start hanging up after about eight",
    )[0];
    if (!resolved) throw new Error("selection did not resolve");
    expect(resolved.address).toBe("c9");
    expect(resolved.recordType).toBe("claim");
    const op = opForFeedback(resolved, "They hang up from six minutes.");
    expect(op.route).toBe("claim/create");
    expect(op.payload.supersedes).toEqual(["c9"]);
  });

  test("answering a question supersedes the claim it projects", () => {
    const conflicted = supportDeskLedger.claims.find(
      (claim) => claim.status === "conflicted",
    );
    if (!conflicted) throw new Error("no conflicted claim in worked example");
    const op = opForAnswer(conflicted, "It holds");
    expect(op.route).toBe("claim/create");
    expect(op.payload.supersedes).toEqual([conflicted.address]);
    expect(op.payload.entities).toEqual(conflicted.entities);
  });
});
