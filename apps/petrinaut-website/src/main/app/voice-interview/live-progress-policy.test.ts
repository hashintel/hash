import { expect, test, vi } from "vitest";

import { ProgressPolicy } from "./live-progress-policy";

const tool = (at: number, name: string, duration = 400) => ({
  at,
  name,
  duration,
});
const burst = (at: number, names: string[], step: number, duration: number) =>
  names.map((name, index) => tool(at + index * step, name, duration));
const build = [
  tool(1_500, "getLatestNetDefinition", 600),
  tool(2_400, "mutate_workpiece", 1_200),
  ...burst(
    7_000,
    [
      "addPlace",
      "addTransition",
      "addArc",
      "addArc",
      "addParameter",
      "addParameter",
      "addTransition",
      "addArc",
    ],
    600,
    400,
  ),
  tool(19_000, "addMetric", 500),
  tool(20_200, "updateTransition", 500),
  tool(24_500, "applyAutoLayout", 900),
  tool(27_000, "getNetCompilationErrors", 600),
];

// The six prototype timelines, with the locked plan's immediate experiment gate.
const scenarios = [
  { name: "quick answer", tools: [], settleAt: 3_000, expected: [] },
  {
    name: "fast burst",
    tools: [
      tool(1_200, "getLatestNetDefinition", 500),
      ...burst(
        2_200,
        [
          "addPlace",
          "addTransition",
          "addArc",
          "addArc",
          "updateTransition",
          "addPlace",
          "addArc",
          "addArc",
        ],
        450,
        300,
      ),
    ],
    settleAt: 9_000,
    expected: [],
  },
  {
    name: "build the net",
    tools: build,
    settleAt: 31_000,
    expected: ["The edits are in. Give me a moment."],
  },
  {
    name: "long experiment draft",
    tools: [
      tool(1_500, "getLatestNetDefinition", 600),
      tool(4_800, "createExperiment", 35_000),
    ],
    settleAt: 45_000,
    expected: [
      "Setting up the comparison.",
      "Still setting up the comparison.",
    ],
  },
  {
    name: "thinking only",
    tools: [],
    settleAt: 26_000,
    expected: ["Give me a moment on this one."],
  },
  {
    name: "interruption held",
    tools: build,
    settleAt: 31_000,
    speech: { from: 15_000, to: 19_000 },
    expected: [],
  },
];

const setup = () => {
  type Output = ConstructorParameters<typeof ProgressPolicy>[0];
  const commentary = vi.fn<Output["commentary"]>(() => true);
  const thinking = vi.fn<Output["thinking"]>();
  const diagnostic = vi.fn<Output["diagnostic"]>();
  const policy = new ProgressPolicy({ commentary, thinking, diagnostic });
  policy.startTurn(0);
  policy.acknowledged(600);
  return { policy, commentary, thinking, diagnostic };
};

test.each(scenarios)(
  "$name matches the prototype without speaking near settlement",
  (scenario) => {
    const { policy, commentary } = setup();
    const spokenAt: number[] = [];
    // 50 ms inputs retain the scripted boundaries; evaluation is every 250 ms.
    for (let now = 0; now <= scenario.settleAt + 40_000; now += 50) {
      for (const [index, call] of scenario.tools.entries()) {
        if (now === call.at) policy.toolStarted(String(index), call.name, now);
        if (now === call.at + call.duration)
          policy.toolFinished(String(index), now, true);
      }
      policy.userSpeaking(
        !!scenario.speech &&
          now >= scenario.speech.from &&
          now < scenario.speech.to,
      );
      if (now === scenario.settleAt) policy.settled();
      if (now % 250 === 0 && policy.evaluate(now)?.speak) spokenAt.push(now);
    }
    expect(commentary.mock.calls.map(([line]) => line)).toEqual(
      scenario.expected,
    );
    expect(spokenAt.every((at) => at < scenario.settleAt - 1_000)).toBe(true);
  },
);

test("approval waits stay silent, then execution gets its own running clock", () => {
  const { policy, commentary, thinking } = setup();
  policy.toolStarted("delete", "removePlace", 1_000, "awaiting-approval");
  for (let now = 1_000; now <= 60_000; now += 250) policy.evaluate(now);
  expect(commentary).not.toHaveBeenCalled();
  expect(
    thinking.mock.calls.map(([context]) => context.progress.phase),
  ).toEqual(["awaiting-approval"]);
  policy.toolStarted("delete", "removePlace", 60_000);
  expect(policy.evaluate(62_499)?.speak).toBe(false);
  expect(policy.evaluate(62_500)?.speak).toBe(true);
  expect(commentary).toHaveBeenCalledWith("Making those changes now.");
});

test("ack, running, gap, repeat and cap gates include their exact boundaries", () => {
  const { policy, commentary } = setup();
  policy.toolStarted("one", "addPlace", 4_100);
  expect(policy.evaluate(6_599)?.speak).toBe(false);
  expect(policy.evaluate(6_600)?.speak).toBe(true);
  expect(policy.evaluate(26_600)?.speak).toBe(false);
  expect(policy.evaluate(36_599)?.speak).toBe(false);
  expect(policy.evaluate(36_600)?.speak).toBe(true);
  policy.toolStarted("two", "createExperiment", 60_000);
  expect(policy.evaluate(100_000)?.speak).toBe(false);
  expect(commentary.mock.calls).toEqual([
    ["Making those changes now."],
    ["Still working through the changes."],
  ]);
});

test.each([
  ["createExperiment", "Setting up the comparison."],
  ["draft_petrinaut_experiment", "Setting up the comparison."],
  ["task", "Working through the details."],
  ["activate_skill", "Working through the details."],
  ["read_skill_resource", "Working through the details."],
])("%s qualifies immediately once acknowledged", (name, line) => {
  const { policy, commentary } = setup();
  policy.toolStarted("one", name, 7_000);
  expect(policy.evaluate(7_000)?.speak).toBe(true);
  expect(commentary).toHaveBeenCalledWith(line);
});

test.each([
  "mutate_workpiece",
  "read_workpiece",
  "query_workpiece",
  "ping",
  "unknown_tool",
])("%s keeps the normal running delay", (name) => {
  const { policy, commentary } = setup();
  policy.toolStarted("one", name, 7_000);
  expect(policy.evaluate(7_000)?.reason).toBe("activity");
  expect(policy.evaluate(9_499)?.reason).toBe("activity");
  expect(policy.evaluate(9_500)?.speak).toBe(true);
  expect(commentary).toHaveBeenCalledExactlyOnceWith(
    "Working through the details.",
  );
});

test("a fast non-substrate burst after acknowledgement stays silent", () => {
  const { policy, commentary } = setup();
  for (const [index, name] of [
    "read_workpiece",
    "mutate_workpiece",
    "query_workpiece",
    "ping",
    "unknown_tool",
  ].entries()) {
    const now = 6_600 + index * 200;
    policy.toolStarted(name, name, now);
    policy.evaluate(now);
    policy.toolFinished(name, now + 100, true);
    policy.evaluate(now + 100);
  }
  policy.settled();
  policy.evaluate(20_000);
  expect(commentary).not.toHaveBeenCalled();
});

test("a changed phase still waits twenty seconds and Live speech holds it", () => {
  const { policy } = setup();
  policy.evaluate(6_600);
  policy.toolStarted("experiment", "createExperiment", 26_000);
  expect(policy.evaluate(26_599)?.speak).toBe(false);
  policy.liveSpeaking(true);
  expect(policy.evaluate(26_600)?.speak).toBe(false);
  policy.liveSpeaking(false);
  expect(policy.evaluate(26_601)?.speak).toBe(true);
});

test("phase changes publish quiet state even before speech qualifies; duplicates do not reset running time", () => {
  const { policy, thinking, diagnostic } = setup();
  policy.evaluate(1_000);
  policy.toolStarted("one", "addPlace", 4_500);
  policy.evaluate(4_500);
  policy.toolStarted("one", "addPlace", 6_500);
  expect(policy.evaluate(6_999)?.speak).toBe(false);
  expect(policy.evaluate(7_000)?.speak).toBe(true);
  expect(thinking.mock.calls.map(([value]) => value.progress.phase)).toEqual([
    "thinking",
    "mutation",
    "mutation",
  ]);
  const suppressions = diagnostic.mock.calls.filter(
    ([name]) => name === "progress.suppressed",
  );
  policy.evaluate(7_001);
  policy.evaluate(7_002);
  expect(
    diagnostic.mock.calls.filter(([name]) => name === "progress.suppressed"),
  ).toHaveLength(suppressions.length + 1);
});

test.each([
  [
    "getLatestNetDefinition",
    true,
    "I've had a look at the model. Give me a moment.",
  ],
  [
    "draft_petrinaut_experiment",
    true,
    "The comparison is drafted. One moment.",
  ],
  ["createExperiment", true, "Give me a moment on this one."],
  ["createExperiment", false, "Give me a moment on this one."],
])(
  "idle after %s success=%s only describes reported success",
  (name, succeeded, line) => {
    const { policy, commentary } = setup();
    policy.toolStarted("one", name, 1_000);
    policy.toolFinished("one", 2_000, succeeded);
    expect(policy.evaluate(6_999)?.speak).toBe(false);
    expect(policy.evaluate(7_000)?.speak).toBe(true);
    expect(commentary).toHaveBeenCalledWith(line);
  },
);

test("concurrent same-name calls and failed edits cannot imply completed edits", () => {
  const { policy, commentary } = setup();
  policy.toolStarted("one", "addPlace", 1_000);
  policy.toolStarted("two", "addPlace", 2_000);
  policy.toolStarted("three", "addPlace", 3_000);
  policy.toolFinished("one", 4_000, true);
  policy.toolFinished("three", 5_000, true);
  expect(policy.evaluate(6_600)?.phase.state).toBe("running");
  policy.toolFinished("two", 7_000, false);
  policy.evaluate(36_600);
  expect(commentary).not.toHaveBeenCalledWith(
    "The edits are in. Give me a moment.",
  );
});

test("input streaming does not count as executing, and a new turn resets gates", () => {
  const { policy, commentary } = setup();
  policy.toolStarted("one", "addPlace", 1_000, "preparing");
  expect(policy.evaluate(60_000)?.speak).toBe(false);
  policy.endTurn();
  expect(policy.evaluate(61_000)).toBeNull();
  policy.startTurn(62_000);
  expect(policy.evaluate(70_000)?.speak).toBe(false);
  policy.acknowledged(71_000);
  expect(policy.evaluate(77_000)?.speak).toBe(true);
  expect(commentary).toHaveBeenCalledOnce();
});
