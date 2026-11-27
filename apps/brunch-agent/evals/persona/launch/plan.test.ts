import { expect, test } from "vitest";

import {
  assertValidScriptedLaunch,
  personaCaseSha256,
  planPersonaLaunch,
  verifyPersonaCaseResume,
} from "./plan.ts";
import { parsePersonaScript } from "./script.ts";

const makeScript = (steps: unknown) => ({
  script: parsePersonaScript({ steps }),
});

test("plans a fresh --case run with a script that has no open step without requiring bridge opening", () => {
  const plan = planPersonaLaunch({
    caseDirectory: "/cases/inventory-purchasing",
    driver: {
      kind: "scripted",
      scriptPath: "/tmp/say-only.json",
      scriptSha256: "abcdef0123456789",
    },
    script: makeScript([
      { type: "say", message: "Start directly without open." },
      { type: "end" },
    ]),
  });

  expect(plan).toEqual({
    effectiveDriver: {
      kind: "scripted",
      scriptPath: "/tmp/say-only.json",
      scriptSha256: "abcdef0123456789",
    },
    needsFreshBriefOnResume: false,
    shouldReadCase: true,
    expectsBridgeOpening: false,
  });
});

test("plans a fresh --case run with an open-step script as expecting a bridge opening", () => {
  const plan = planPersonaLaunch({
    caseDirectory: "/cases/inventory-purchasing",
    driver: {
      kind: "scripted",
      scriptPath: "/tmp/with-open.json",
      scriptSha256: "abcdef0123456789",
    },
    script: makeScript([
      { type: "open" },
      { type: "say", message: "Follow up." },
    ]),
  });

  expect(plan.shouldReadCase).toBe(true);
  expect(plan.expectsBridgeOpening).toBe(true);
});

test("plans a case-less scripted run without reading a case or expecting a bridge opening", () => {
  const plan = planPersonaLaunch({
    driver: {
      kind: "scripted",
      scriptPath: "/tmp/say-only.json",
      scriptSha256: "abcdef0123456789",
    },
    script: makeScript([{ type: "say", message: "Hello." }]),
  });

  expect(plan.shouldReadCase).toBe(false);
  expect(plan.expectsBridgeOpening).toBe(false);
});

test("plans a fresh agent run as reading the case and expecting a bridge opening", () => {
  const plan = planPersonaLaunch({
    caseDirectory: "/cases/inventory-purchasing",
    driver: { kind: "agent", agent: "claude" },
  });

  expect(plan).toEqual({
    effectiveDriver: { kind: "agent", agent: "claude" },
    needsFreshBriefOnResume: false,
    shouldReadCase: true,
    expectsBridgeOpening: true,
  });
});

test("plans resuming a case-tagged scripted run with an agent as needing a fresh brief without bridge opening", () => {
  const plan = planPersonaLaunch({
    resume: {
      config: {
        personaDriver: {
          kind: "scripted",
          scriptPath: "/tmp/part1.json",
          scriptSha256: "abcdef0123456789",
        },
      },
      hasBrief: false,
    },
    caseDirectory: "/cases/inventory-purchasing",
    driver: { kind: "agent", agent: "claude" },
  });

  expect(plan).toEqual({
    effectiveDriver: { kind: "agent", agent: "claude" },
    needsFreshBriefOnResume: true,
    shouldReadCase: true,
    expectsBridgeOpening: false,
  });
});

test("refuses resuming a scripted run without an explicit driver or a case-less scripted run with an agent", () => {
  const scriptedResume = {
    config: {
      personaDriver: {
        kind: "scripted",
        scriptPath: "/tmp/part1.json",
        scriptSha256: "abcdef0123456789",
      },
    },
    hasBrief: false,
  };
  expect(() => planPersonaLaunch({ resume: scriptedResume })).toThrow(
    /Cannot automatically resume a scripted run without a driver option/,
  );
  expect(() =>
    planPersonaLaunch({
      resume: scriptedResume,
      driver: { kind: "agent", agent: "claude" },
    }),
  ).toThrow(/Cannot resume a case-less scripted run with a persona agent/);
});

test("assertValidScriptedLaunch enforces objective and open-step rules", () => {
  expect(() =>
    assertValidScriptedLaunch({
      resume: false,
      objective: "Private goal",
      script: makeScript([{ type: "say", message: "Hi." }]),
    }),
  ).toThrow(/--script cannot be combined with --objective/);
  expect(() =>
    assertValidScriptedLaunch({
      resume: true,
      script: makeScript([{ type: "open" }]),
    }),
  ).toThrow(/A --script passed with --resume cannot contain an `open` step/);
  expect(() =>
    assertValidScriptedLaunch({
      resume: false,
      script: makeScript([{ type: "open" }]),
    }),
  ).toThrow(/Persona script contains an `open` step, which requires --case/);
});

test("verifyPersonaCaseResume accepts unchanged case files and rejects drifted case files", () => {
  const original = {
    pack: "You manage inventory.",
    opening: "Help me model purchasing.",
  };
  const retainedSha = personaCaseSha256({
    ...original,
    objective: undefined,
  });

  expect(() =>
    verifyPersonaCaseResume(retainedSha, "/cases/inventory", original),
  ).not.toThrow();
  expect(() =>
    verifyPersonaCaseResume(retainedSha, "/cases/inventory", {
      ...original,
      pack: "Modified situation pack.",
    }),
  ).toThrow(/Case \/cases\/inventory changed since this run/);
});
