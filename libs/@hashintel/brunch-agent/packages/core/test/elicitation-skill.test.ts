import { describe, expect, test } from "vitest";

import { elicitationSkill } from "../src/skills/elicitation/skill";
import { skillFromMarkdown } from "../src/skills/skill-markdown";

describe("the authored elicitation skill", () => {
  test("loads its universal guidance on activation without a mandatory resource read", () => {
    expect(elicitationSkill.name).toBe("elicitation");
    expect(elicitationSkill.files).toBeUndefined();
    expect(elicitationSkill.instructions).toContain("# Adaptive elicitation");
    expect(elicitationSkill.instructions).toContain("## Directives");
    expect(elicitationSkill.instructions).toContain("## Operations");
    expect(elicitationSkill.instructions).toContain("## Coverage");
    expect(elicitationSkill.instructions).toContain("## Verification");
    expect(elicitationSkill.instructions).not.toContain(
      "references/universal-elicitation.md",
    );
  });

  test("owns shared workpiece settlement, evidence and locator guidance", () => {
    const instructions = elicitationSkill.instructions;
    expect(instructions).toContain("`update_workpiece`");
    expect(instructions).toContain(
      "as soon as one consequential distinction exists",
    );
    expect(instructions).toContain(
      "after each useful stretch or correction and before delivery",
    );
    expect(instructions).toContain("full current Markdown account");
    expect(instructions).toContain("`revisionId` and `sha256`");
    expect(instructions).toContain("Read back with `brunch_workpiece`");
    expect(instructions).toContain(
      "unsettled `markdown` candidate and `locateTexts`",
    );
    expect(instructions).toContain(
      "immutable UTF-16 `locator: { start, end }`, `messageIds`, and `kind`",
    );
    expect(instructions).toContain(
      "`elicited`, `inference`, `default`, `formalism-constraint`, `external`, or `correction`",
    );
    expect(instructions).toContain(
      "Elicited relations need actual user sources",
    );
    expect(instructions).toContain("Changed text requires a fresh lookup");
    expect(instructions).toContain(
      "duplicates, overlapping matches and any omitted matches",
    );
    expect(instructions).toContain(
      "Valid IDs and spans do not establish relevance",
    );
    expect(instructions).toContain(
      "Only unique unchanged text at the same revision-local span",
    );
    expect(instructions).toContain(
      "No relation means temporal context, not implied support",
    );
    expect(instructions).toContain(
      "no introduced-by or passage-identity claim",
    );
  });

  test("keeps practice defaults distinct from normative and consulted accounts", () => {
    const instructions = elicitationSkill.instructions;
    expect(instructions).toContain(
      "For practice-based sources, prefer concrete remembered cases",
    );
    expect(instructions).toContain(
      "what happens now, what should happen, or a discrepancy that matters",
    );
    expect(instructions).toContain(
      "how its meaning relates to the account the person is giving",
    );
    expect(instructions).toContain(
      "Stop at the granularity the source can support",
    );
    expect(instructions).toContain(
      "For practice-based accounts, observability is the default",
    );
    expect(instructions).toContain(
      "Every load-bearing claim is supported by the person's account, attributed to consulted material",
    );
    expect(instructions).toContain(
      "accepted, disputed, or not yet shown; if shown but unsettled, say so",
    );
    expect(instructions).toContain(
      "the `external` kind alone does not express that standing",
    );
    expect(instructions).toContain(
      "an external URL or tool-result ID is not a user message ID",
    );
    expect(instructions).toContain(
      "An `external` relation may use an empty `messageIds` list",
    );
    expect(instructions).toContain(
      "use an available authorized source-side tool",
    );
    expect(instructions).toContain(
      "If no such capability is available, name the gap",
    );
    expect(instructions).toContain("A lookup narrows the next question");
    expect(instructions).toContain("not a second model call");
  });

  test("parses frontmatter fields without interpreting field names as patterns", () => {
    const skill = skillFromMarkdown(
      "---\r\nname: example\r\ndescription: Example skill\r\n---\r\nDo the work.\r\n",
    );

    expect(skill).toMatchObject({
      name: "example",
      description: "Example skill",
      instructions: "Do the work.",
    });
  });
});
