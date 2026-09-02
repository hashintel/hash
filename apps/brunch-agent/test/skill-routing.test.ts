import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;

test("the built ChatAgent routes review and revision with v3 disclosure restraint", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    `${testDirectory}/skill-routing.integration.ts`,
    `${testDirectory}/../../..`,
  );
  expect(exitCode, stderr || stdout).toBe(0);

  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("SKILL_ROUTING_RESULT "));
  expect(resultLine, stdout).toBeDefined();
  const result = JSON.parse(
    resultLine!.slice("SKILL_ROUTING_RESULT ".length),
  ) as {
    resolvableReview: {
      resources: string[];
      questionCount: number;
      text: string;
    };
    humanGapReview: { resources: string[]; questionCount: number };
    revision: { resources: string[]; emittedWorkpiece: boolean };
  };

  expect(result.resolvableReview.resources).toEqual([]);
  expect(result.resolvableReview.questionCount).toBe(0);
  expect(result.resolvableReview.text).toContain(
    "reduce missed dispatch windows",
  );
  expect(result.humanGapReview.resources).toHaveLength(2);
  expect(result.humanGapReview.resources[0]).toContain(
    "references/universal-elicitation.md",
  );
  expect(result.humanGapReview.resources[1]).toContain("references/profile.md");
  expect(result.humanGapReview.questionCount).toBe(1);
  expect(result.revision.resources).toHaveLength(3);
  expect(result.revision.resources[2]).toContain("templates/workpiece.md");
  expect(result.revision.emittedWorkpiece).toBe(true);
});
