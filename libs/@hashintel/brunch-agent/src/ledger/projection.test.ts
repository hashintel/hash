import { expect, test } from "vitest";

import { projectLedger, renderLedgerMarkdown } from "./projection";
import { supportDeskLedger } from "./projection/fixtures/support-desk-ledger";

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

test("open and conflicted claims list as plain-markdown questions", () => {
  const openQuestions = user.slice(
    user.indexOf("## Open questions"),
    user.indexOf("## Checks still owed"),
  );
  expect(openQuestions).toContain(
    "- Is the current six one agent too many on the peak block?\n  - Accounts disagree",
  );
  expect(openQuestions).toContain(
    "- Is there a pattern inside the two-hour block",
  );
  expect(openQuestions).not.toContain(":::");
  expect(openQuestions).not.toContain("- [ ]");
  expect(agent).toContain(
    "- Is the current six one agent too many on the peak block? `c10`",
  );
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

test("a question that names no entity drops its concerns clause", () => {
  const rendered = renderLedgerMarkdown(
    projectLedger({
      ...supportDeskLedger,
      claims: [
        {
          address: "c99",
          text: "Who owns the overnight queue?",
          entities: [],
          origin: "stated",
          status: "open",
          turn: "msg-05",
        },
      ],
    }),
    "user",
  );
  expect(rendered).toContain(
    "- Who owns the overnight queue?\n  - It matters and nobody knows yet.\n",
  );
  expect(rendered).not.toContain("Concerns: .");
});
