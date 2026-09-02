import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const testDirectory = import.meta.dirname;
const runnerPath = join(
  testDirectory,
  "../../../libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/run.ts",
);
const repositoryRoot = join(testDirectory, "../../..");
const frozenBaselineDirectory = join(
  repositoryRoot,
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-prospective-baseline-v1",
);
const modelKeyName = ["ANTHROPIC", "API", "KEY"].join("_");
const fauxExpertPath = join(
  testDirectory,
  "runbook-elicitation-faux-expert.ts",
);
const fauxProviderPath = join(
  testDirectory,
  "runbook-elicitation-faux-provider.ts",
);

const hermeticEnvironment = (
  outputDirectory: string,
): Record<string, string> => ({
  [modelKeyName]: "",
  BRUNCH_CHAT_MODEL: "claude-haiku-4-5",
  BRUNCH_RUNBOOK_EXPERT_MODEL: "faux-vestera-expert",
  BRUNCH_RUNBOOK_HARD_STOP: "2",
  BRUNCH_RUNBOOK_REPLICATION: "1",
  BRUNCH_RUNBOOK_OUTPUT_DIR: outputDirectory,
  BRUNCH_RUNBOOK_ALLOW_DIRTY_INSTRUMENT: "1",
  BRUNCH_RUNBOOK_ANTHROPIC_MODULE: fauxExpertPath,
  BRUNCH_RUNBOOK_INTERVIEWER_PROVIDER_MODULE: fauxProviderPath,
});

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

test.each([
  ["exact", frozenBaselineDirectory],
  ["dot alias", `${frozenBaselineDirectory}/.`],
  ["descendant", join(frozenBaselineDirectory, "forbidden-descendant")],
])(
  "hermetic candidate runs reject the immutable v1 %s path",
  async (_, outputDirectory) => {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      hermeticEnvironment(outputDirectory),
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("immutable vestera-prospective-baseline-v1");
  },
);

test("hermetic candidate runs reject a symlink into immutable v1", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brunch-v4-baseline-link-"));
  const outputDirectory = join(directory, "baseline-alias");
  await symlink(frozenBaselineDirectory, outputDirectory, "dir");
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      hermeticEnvironment(outputDirectory),
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("immutable vestera-prospective-baseline-v1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hermetic candidate runs admit only the checked-in faux modules", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-module-guard-"),
  );
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        ...hermeticEnvironment(outputDirectory),
        BRUNCH_RUNBOOK_ANTHROPIC_MODULE: join(repositoryRoot, "package.json"),
      },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("approved checked-in faux fixture");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("hermetic candidate runs reject a model API key", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-key-guard-"),
  );
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        ...hermeticEnvironment(outputDirectory),
        [modelKeyName]: "must-not-be-admitted",
      },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(`must not receive ${modelKeyName}`);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("paid candidate runs reject a different output namespace", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-wrong-output-"),
  );
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        [modelKeyName]: "not-used-before-output-guard",
        BRUNCH_CHAT_MODEL: "claude-sonnet-4-5",
        BRUNCH_RUNBOOK_EXPERT_MODEL: "claude-sonnet-4-5",
        BRUNCH_RUNBOOK_HARD_STOP: "8",
        BRUNCH_RUNBOOK_LATENCY_STOP_MS: "180000",
        BRUNCH_RUNBOOK_REPLICATION: "1",
        BRUNCH_RUNBOOK_OUTPUT_DIR: outputDirectory,
      },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      "Paid candidate runs must write to vestera-architecture-candidate-v4",
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("paid candidate runs reject changed frozen configuration", async () => {
  const { exitCode, stderr } = await runNodeScript(runnerPath, repositoryRoot, {
    [modelKeyName]: "not-used-before-configuration-guard",
    BRUNCH_CHAT_MODEL: "claude-haiku-4-5",
    BRUNCH_RUNBOOK_EXPERT_MODEL: "claude-sonnet-4-5",
    BRUNCH_RUNBOOK_HARD_STOP: "8",
    BRUNCH_RUNBOOK_LATENCY_STOP_MS: "180000",
    BRUNCH_RUNBOOK_REPLICATION: "1",
  });

  expect(exitCode).not.toBe(0);
  expect(stderr).toContain(
    "require the frozen prospective-runbook-v4 model, turn, and latency configuration",
  );
});

test("the hermetic candidate run records its exact instrument and workpiece", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-success-"),
  );
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      hermeticEnvironment(outputDirectory),
    );

    expect(exitCode, stderr || stdout).toBe(0);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("PROSPECTIVE_RUNBOOK_V4_RESULT "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("PROSPECTIVE_RUNBOOK_V4_RESULT ".length),
    ) as {
      artifactBase: string;
      hasIr: boolean;
      outputNamespaceId: string;
      protocolId: string;
      replication: number;
      resourceFilesRead: string[];
      toolNames: string[];
      wroteCaptureStore: boolean;
    };
    expect(result).toMatchObject({
      protocolId: "prospective-runbook-v4",
      outputNamespaceId: "vestera-architecture-candidate-v4",
      replication: 1,
      hasIr: true,
      wroteCaptureStore: false,
    });
    expect(result.toolNames).toEqual(["activate_skill", "read_skill_resource"]);
    expect(result.resourceFilesRead).toEqual([
      "universal-elicitation.md",
      "profile.md",
      "workpiece.md",
    ]);

    const record = JSON.parse(
      await readFile(`${result.artifactBase}.json`, "utf8"),
    ) as {
      campaignFingerprint: string;
      comparisonTarget: {
        memberRunIds: string[];
        outputNamespaceId: string;
        protocolId: string;
        qualityPopulation: string;
        runtimeAccounting: string;
      };
      expertCalls: Array<{
        observedModel: string | null;
        requestedModel: string;
        stopReason: string | null;
      }>;
      instrument: {
        builtArtifactManifest: Array<{ path: string; sha256: string }>;
        builtArtifactManifestSha256: string;
        fileSha256: Record<string, string>;
        sourceCommit: string;
      };
      modelCalls: Array<{
        observedModel: string | null;
        providerName: string;
        requestedModel: string;
        stopReason: string | null;
      }>;
      rawConversationSnapshot: unknown;
      rawConversationSnapshotSha256: string;
      status: string;
      workpiece: {
        content: string;
        sha256: string;
        sourceMessageId: string;
        sourceMessageSha256: string;
      };
    };
    expect(record.status).toBe("completed");
    expect(record.comparisonTarget).toEqual({
      protocolId: "prospective-runbook-v1",
      outputNamespaceId: "vestera-prospective-baseline-v1",
      memberRunIds: [
        "runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f",
        "runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c",
      ],
      qualityPopulation: "valid-workpieces",
      runtimeAccounting: "reported-separately",
    });
    expect(record.campaignFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(record.instrument.sourceCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(record.instrument.builtArtifactManifestSha256).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(
      record.instrument.builtArtifactManifest.map(({ path }) => path),
    ).toEqual(
      expect.arrayContaining([
        "apps/brunch-agent/dist/app.mjs",
        "apps/brunch-agent/dist/server.mjs",
      ]),
    );
    expect(
      record.instrument.builtArtifactManifest.some(({ path }) =>
        /apps\/brunch-agent\/dist\/node-server-.+\.mjs$/u.test(path),
      ),
    ).toBe(true);
    expect(record.instrument.fileSha256).toHaveProperty("yarn.lock");
    expect(record.rawConversationSnapshotSha256).toBe(
      sha256(JSON.stringify(record.rawConversationSnapshot)),
    );
    expect(record.workpiece.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(record.workpiece.sha256).toBe(sha256(record.workpiece.content));
    expect(record.workpiece.sourceMessageId).toBeTruthy();
    expect(record.workpiece.sourceMessageSha256).toMatch(/^[0-9a-f]{64}$/u);
    const sourceMessage = (
      record.rawConversationSnapshot as {
        messages: Array<{ id: string }>;
      }
    ).messages.find(({ id }) => id === record.workpiece.sourceMessageId);
    expect(sourceMessage).toBeDefined();
    expect(record.workpiece.sourceMessageSha256).toBe(
      sha256(JSON.stringify(sourceMessage)),
    );
    expect(record.expertCalls).toEqual([
      expect.objectContaining({
        requestedModel: "faux-vestera-expert",
        observedModel: "faux-vestera-expert",
        stopReason: null,
      }),
    ]);
    expect(record.modelCalls.length).toBeGreaterThan(0);
    expect(record.modelCalls[0]).toEqual(
      expect.objectContaining({
        requestedModel: "claude-haiku-4-5",
        providerName: "anthropic",
      }),
    );
    for (const requiredPath of [
      "libs/@hashintel/brunch-agent/packages/core/src/SYSTEM.md",
      "libs/@hashintel/brunch-agent/packages/core/src/universal-elicitation.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/APPEND_SYSTEM.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/flue.ts",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/skill.ts",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/instructions.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/profile.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/workpiece-template.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/pn-construction.md",
      "libs/@hashintel/brunch-agent/packages/plugin-sdcpn/src/skills/sdcpn-modelling/checks.md",
      "apps/brunch-agent/src/agents/chat-agent/agent.ts",
      "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/run.ts",
      "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/opening-message.md",
      "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/situation-pack.md",
      "libs/@hashintel/brunch-agent/evaluations/oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml",
      "libs/@hashintel/brunch-agent/evaluations/oracles/ir-quality-ruler-v1.md",
      "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/omniscient-grader.md",
      "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md",
      "libs/@hashintel/brunch-agent/evaluations/protocols/mission-4-product-witness-v2/protocol.md",
      "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/protocol.md",
      "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/run.ts",
      "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/grade.ts",
      "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v4/score-report.ts",
    ]) {
      expect(record.instrument.fileSha256).toHaveProperty(requiredPath);
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("two identical hermetic runs retain the same build manifest and fingerprint", async () => {
  const outputDirectories = await Promise.all([
    mkdtemp(join(tmpdir(), "brunch-candidate-v4-stability-a-")),
    mkdtemp(join(tmpdir(), "brunch-candidate-v4-stability-b-")),
  ]);
  try {
    const records = await Promise.all(
      outputDirectories.map(async (outputDirectory) => {
        const { exitCode, stdout, stderr } = await runNodeScript(
          runnerPath,
          repositoryRoot,
          hermeticEnvironment(outputDirectory),
        );
        expect(exitCode, stderr || stdout).toBe(0);
        const name = (await readdir(outputDirectory)).find((entry) =>
          entry.endsWith(".json"),
        );
        return JSON.parse(
          await readFile(join(outputDirectory, name!), "utf8"),
        ) as {
          campaignFingerprint: string;
          instrument: {
            builtArtifactManifest: unknown;
            builtArtifactManifestSha256: string;
          };
        };
      }),
    );
    expect(records[1]!.instrument).toEqual(records[0]!.instrument);
    expect(records[1]!.campaignFingerprint).toBe(
      records[0]!.campaignFingerprint,
    );
  } finally {
    await Promise.all(
      outputDirectories.map((path) =>
        rm(path, { recursive: true, force: true }),
      ),
    );
  }
});

test.each([
  [
    "construction resource read",
    "construction-resource",
    "construction-resource-read",
  ],
  ["construction tool use", "construction-tool", "construction-tool-use"],
  ["capture tool use", "capture-tool", "capture-tool-use"],
  ["missing workpiece", "missing-workpiece", "missing-workpiece"],
  ["unexpected ordinary-path tool", "unexpected-tool", "unexpected-tool-use"],
])(
  "an adversarial hermetic %s is retained as invalid",
  async (_, violation, expectedCode) => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), "brunch-candidate-v4-invalid-"),
    );
    try {
      const { exitCode, stdout, stderr } = await runNodeScript(
        runnerPath,
        repositoryRoot,
        {
          ...hermeticEnvironment(outputDirectory),
          BRUNCH_RUNBOOK_FAUX_VIOLATION: violation,
        },
      );

      expect(exitCode, stderr || stdout).not.toBe(0);
      const recordName = (await readdir(outputDirectory)).find((entry) =>
        entry.endsWith(".json"),
      );
      const record = JSON.parse(
        await readFile(join(outputDirectory, recordName!), "utf8"),
      ) as {
        rawConversationSnapshot: unknown;
        status: string;
        violations: Array<{ code: string }>;
      };
      expect(record.status).toBe("invalid");
      expect(record.violations).toContainEqual(
        expect.objectContaining({ code: expectedCode }),
      );
      expect(record.rawConversationSnapshot).toBeDefined();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  },
);

test("a runtime failure retains a machine-readable candidate artifact", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-failure-"),
  );
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        ...hermeticEnvironment(outputDirectory),
        BRUNCH_RUNBOOK_FAUX_EXPERT_FAIL: "1",
      },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("PROSPECTIVE_RUNBOOK_V4_FAILURE");
    const files = await readdir(outputDirectory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.failure-[0-9a-f]{8}\.json$/u);
    const failureRecord = JSON.parse(
      await readFile(join(outputDirectory, files[0]!), "utf8"),
    ) as {
      failure: { message: string };
      outputNamespaceId: string;
      protocolId: string;
      replication: number;
      runId: string;
      invalidReason: string;
      status: string;
      rawConversationSnapshot?: unknown;
    };
    expect(failureRecord).toMatchObject({
      protocolId: "prospective-runbook-v4",
      outputNamespaceId: "vestera-architecture-candidate-v4",
      replication: 1,
      status: "invalid",
      invalidReason: "runtime-failure",
      failure: { message: "Deliberate faux expert failure" },
    });
    expect(failureRecord.runId).toContain(
      "prospective-runbook-v4-replication-1",
    );
    expect(failureRecord.rawConversationSnapshot).toBeDefined();
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("an artifact write collision retains the original failure at a distinct path", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-write-failure-"),
  );
  try {
    const { exitCode, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        ...hermeticEnvironment(outputDirectory),
        BRUNCH_RUNBOOK_FAUX_ARTIFACT_COLLISION: "1",
      },
    );

    expect(exitCode).not.toBe(0);
    const files = await readdir(outputDirectory);
    const failureName = files.find((name) => name.includes(".failure-"));
    expect(failureName).toBeDefined();
    expect(stderr).toContain("EEXIST");
    const failureRecord = JSON.parse(
      await readFile(join(outputDirectory, failureName!), "utf8"),
    ) as {
      failure: { message: string };
      invalidReason: string;
      status: string;
    };
    expect(failureRecord).toMatchObject({
      status: "invalid",
      invalidReason: "runtime-failure",
    });
    expect(failureRecord.failure.message).toContain("EEXIST");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("cleanup errors are visible and retained without masking the run", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "brunch-candidate-v4-cleanup-failure-"),
  );
  let databasePath: string | undefined;
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      runnerPath,
      repositoryRoot,
      {
        ...hermeticEnvironment(outputDirectory),
        BRUNCH_RUNBOOK_FAUX_CLEANUP_FAIL: "1",
      },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("PROSPECTIVE_RUNBOOK_V4_CLEANUP_FAILURE");
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("PROSPECTIVE_RUNBOOK_V4_RESULT "));
    expect(resultLine).toBeDefined();
    const { artifactBase } = JSON.parse(
      resultLine!.slice("PROSPECTIVE_RUNBOOK_V4_RESULT ".length),
    ) as { artifactBase: string };
    databasePath = join(tmpdir(), `${basename(artifactBase)}.db`);
    const cleanupName = (await readdir(outputDirectory)).find((name) =>
      name.includes(".cleanup-failure-"),
    );
    expect(cleanupName).toBeDefined();
    const cleanupRecord = JSON.parse(
      await readFile(join(outputDirectory, cleanupName!), "utf8"),
    ) as {
      cleanupFailures: Array<{ operation: string }>;
      invalidReason: string;
      status: string;
    };
    expect(cleanupRecord).toMatchObject({
      status: "invalid",
      invalidReason: "cleanup-failure",
    });
    expect(cleanupRecord.cleanupFailures).toContainEqual(
      expect.objectContaining({ operation: "remove-temporary-database" }),
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
    if (databasePath !== undefined) {
      await rm(databasePath, { recursive: true, force: true });
      await rm(`${databasePath}.retained`, { force: true });
      await rm(`${databasePath}.retained-shm`, { force: true });
      await rm(`${databasePath}.retained-wal`, { force: true });
    }
  }
});
