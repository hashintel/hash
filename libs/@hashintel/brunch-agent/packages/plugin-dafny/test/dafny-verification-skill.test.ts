import { expect, test } from "vitest";

import { dafnyVerificationSkill } from "../src/skills/dafny-verification/skill";

test("the stub skill is a valid Flue skill whose name matches its directory", () => {
  expect(dafnyVerificationSkill.name).toBe("dafny-verification");
  expect(dafnyVerificationSkill.description).toMatch(/^Stub\./u);
  expect(dafnyVerificationSkill.instructions).toContain("# Stub");
  expect(dafnyVerificationSkill.files).toBeUndefined();
});
