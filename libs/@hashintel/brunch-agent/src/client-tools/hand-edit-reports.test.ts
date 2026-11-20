import * as v from "valibot";
import { expect, test } from "vitest";

import { handEditReportBodySchema } from "./hand-edit-reports";

const report = {
  binding: "binding-1",
  episode: "episode-1",
  seq: 2,
  revision: "revision-2",
};

test("the body needs a binding, an episode of 1 to 128 characters, a non-empty revision, and a non-negative integer seq", () => {
  expect(v.safeParse(handEditReportBodySchema, report).success).toBe(true);
  expect(
    v.safeParse(handEditReportBodySchema, {
      ...report,
      episode: "e".repeat(128),
    }).success,
  ).toBe(true);
  for (const body of [
    { ...report, binding: undefined },
    { ...report, episode: "" },
    { ...report, episode: "e".repeat(129) },
    { ...report, seq: -1 },
    { ...report, seq: 0.5 },
    { ...report, revision: "" },
  ])
    expect(v.safeParse(handEditReportBodySchema, body).success).toBe(false);
});
