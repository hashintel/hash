import { expect, test } from "vitest";

import { projectLedger, renderLedgerMarkdown } from "./projection";
import { supportDeskLedger } from "./projection/fixtures/support-desk-ledger";

const projection = projectLedger(supportDeskLedger);
const markdown = renderLedgerMarkdown(projection);

test("the worked example renders the approved markdown structure", () => {
  expect(markdown).toMatchSnapshot();
});

test("kind headings carry the label and the kind token; records carry their addresses", () => {
  expect(markdown).toContain("### Purpose `purpose`");
  expect(markdown).toContain("### Aims `direction`");
  expect(markdown).toContain("`c5`");
});

test("empty kinds and clusters render no heading", () => {
  expect(markdown).not.toContain("### Targets");
  expect(markdown).not.toContain("### People and devices");
});

test("superseded claims collapse under their successor, struck through", () => {
  expect(markdown).toContain(
    "~~About 45 calls an hour arrive during the peak.~~ \u2014 superseded",
  );
  const horizons = markdown.slice(markdown.indexOf("### Time spans"));
  expect(
    horizons.indexOf("The phone-system export shows about 50 calls"),
  ).toBeLessThan(horizons.indexOf("~~About 45 calls"));
});

test("open and conflicted claims list as plain-markdown questions", () => {
  const openQuestions = markdown.slice(
    markdown.indexOf("## Open questions"),
    markdown.indexOf("## Checks still owed"),
  );
  expect(openQuestions).toContain(
    "- Is the current six one agent too many on the peak block? `c10`\n  - Accounts disagree",
  );
  expect(openQuestions).toContain(
    "- Is there a pattern inside the two-hour block",
  );
  expect(openQuestions).not.toContain(":::");
  expect(openQuestions).not.toContain("- [ ]");
});

test("out-of-scope entities leave their kind section for the excluded list", () => {
  const measuresStart = markdown.indexOf("### Measures");
  expect(measuresStart).toBeGreaterThan(-1);
  const metrics = markdown.slice(
    measuresStart,
    markdown.indexOf("\n#", measuresStart + 1),
  );
  expect(metrics).not.toContain("Cost of an agent-hour");
  const excluded = markdown.slice(
    markdown.indexOf("## Excluded from the model"),
  );
  expect(excluded).toContain("**Cost of an agent-hour**");
  expect(excluded).toContain("metric \u00b7");
});

test("a multi-entity claim repeats under each entity it references", () => {
  const matches =
    markdown.match(/Staffing is a whole number of agents/gu) ?? [];
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
  );
  expect(rendered).toContain(
    "- Who owns the overnight queue? `c99`\n  - It matters and nobody knows yet.\n",
  );
  expect(rendered).not.toContain("Concerns: .");
});

test("each entity carries the reflections naming it or one of its claims", () => {
  const reflectionsOf = (address: string) =>
    projection.sections
      .flatMap(({ kinds }) => kinds)
      .flatMap(({ entities }) => entities)
      .find(({ record }) => record.address === address)
      ?.reflections.map((reflection) => reflection.address);
  // e9 is named directly; e6 only through claim c8, which r2 addresses.
  expect(reflectionsOf("e9")).toEqual(["r1"]);
  expect(reflectionsOf("e6")).toEqual(["r2"]);
  expect(markdown).not.toContain(supportDeskLedger.reflections[0]?.text);
});

test("a reflection stays under the entity after the claim it cites is replaced", () => {
  const replaced = projectLedger({
    ...supportDeskLedger,
    claims: [
      ...supportDeskLedger.claims,
      {
        address: "c99",
        text: "Calls arrive in two peaks, not one.",
        entities: ["e6"],
        origin: "stated",
        status: "confirmed",
        supersedes: ["c8"],
        turn: "msg-05",
      },
    ],
  });
  const e6 = replaced.sections
    .flatMap(({ kinds }) => kinds)
    .flatMap(({ entities }) => entities)
    .find(({ record }) => record.address === "e6");
  expect(e6?.reflections.map(({ address }) => address)).toEqual(["r2"]);
});
