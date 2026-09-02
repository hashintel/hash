import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { scoreReport } from "./score-report.ts";

const repositoryRootPath = resolve(import.meta.dirname, "../../../../../..");
const candidateDirectory = join(
  repositoryRootPath,
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-architecture-candidate-v5",
);
const protocolId = "prospective-runbook-v5";
const outputNamespaceId = "vestera-architecture-candidate-v5";
const comparisonTarget = {
  protocolId: "prospective-runbook-v1",
  outputNamespaceId: "vestera-prospective-baseline-v1",
  memberRunIds: [
    "runbook-elicitation-2026-08-31T10-50-28-709Z-20a4817f",
    "runbook-elicitation-2026-08-31T10-56-34-754Z-4b75737c",
  ],
  qualityPopulation: "valid-workpieces",
  runtimeAccounting: "reported-separately",
} as const;
const requestedModel = "claude-sonnet-4-5";
const mode = process.env["BRUNCH_ARCHITECTURE_GRADER_MODE"];
const artifactBaseInput = process.env["BRUNCH_RUNBOOK_ARTIFACT_BASE"];
const attempt = process.env["BRUNCH_ARCHITECTURE_GRADER_ATTEMPT"];

if (mode !== "omniscient" && mode !== "cold") {
  throw new Error(
    "BRUNCH_ARCHITECTURE_GRADER_MODE must be omniscient or cold.",
  );
}
if (artifactBaseInput === undefined) {
  throw new Error("BRUNCH_RUNBOOK_ARTIFACT_BASE is required.");
}
if (!process.env["ANTHROPIC_API_KEY"]) {
  throw new Error("ANTHROPIC_API_KEY is required.");
}
if (attempt !== undefined && !/^[2-9][0-9]*$/u.test(attempt)) {
  throw new Error(
    "BRUNCH_ARCHITECTURE_GRADER_ATTEMPT must be an integer of at least 2.",
  );
}

const artifactBase = resolve(artifactBaseInput);
if (
  artifactBase !== join(candidateDirectory, basename(artifactBase)) ||
  !basename(artifactBase).startsWith("prospective-runbook-v5-replication-")
) {
  throw new Error(
    "The grader accepts only a v5 artifact in the frozen candidate namespace.",
  );
}

interface CandidateRecord {
  readonly campaignFingerprint: string;
  readonly comparisonTarget: unknown;
  readonly instrument: {
    readonly fileSha256: Record<string, string>;
  };
  readonly outputNamespaceId: string;
  readonly protocolId: string;
  readonly rawConversationSnapshot: {
    readonly messages: readonly { readonly id: string }[];
  };
  readonly replication: number;
  readonly runId: string;
  readonly status: string;
  readonly transcript: string;
  readonly violations: readonly unknown[];
  readonly workpiece?: {
    readonly content: string;
    readonly sha256: string;
    readonly sourceMessageId: string;
    readonly sourceMessageSha256: string;
  };
}

const sha256 = (content: string): string =>
  createHash("sha256").update(content).digest("hex");
const record = JSON.parse(
  await readFile(`${artifactBase}.json`, "utf8"),
) as CandidateRecord;
const artifactStem = basename(artifactBase);
if (
  record.protocolId !== protocolId ||
  record.outputNamespaceId !== outputNamespaceId ||
  record.runId !== artifactStem ||
  !Number.isSafeInteger(record.replication) ||
  record.replication < 1 ||
  record.replication > 3 ||
  !artifactStem.startsWith(
    `${protocolId}-replication-${record.replication}-`,
  ) ||
  JSON.stringify(record.comparisonTarget) !==
    JSON.stringify(comparisonTarget) ||
  !/^[0-9a-f]{64}$/u.test(record.campaignFingerprint) ||
  record.status !== "completed" ||
  record.violations.length !== 0 ||
  record.workpiece === undefined
) {
  throw new Error("Only an exact valid v5 campaign member may be graded.");
}

const campaignRecordNames = (await readdir(candidateDirectory)).filter((name) =>
  /^prospective-runbook-v5-replication-[123]-.*\.json$/u.test(name),
);
if (campaignRecordNames.length !== 3) {
  throw new Error("Complete all three v5 replications before grading.");
}

const ir = (await readFile(`${artifactBase}.ir.md`, "utf8")).trimEnd();
if (ir !== record.workpiece.content || sha256(ir) !== record.workpiece.sha256) {
  throw new Error(
    "The selected workpiece does not match its candidate record.",
  );
}
const sourceMessage = record.rawConversationSnapshot.messages.find(
  ({ id }) => id === record.workpiece?.sourceMessageId,
);
if (
  sourceMessage === undefined ||
  sha256(JSON.stringify(sourceMessage)) !== record.workpiece.sourceMessageSha256
) {
  throw new Error(
    "The selected workpiece source message does not match its candidate record.",
  );
}

for (const sourcePath of [
  "apps/brunch-agent/src/evaluations/runbook/campaign-integrity.ts",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/grade.ts",
  "libs/@hashintel/brunch-agent/evaluations/protocols/prospective-runbook-v5/score-report.ts",
] as const) {
  const source = await readFile(join(repositoryRootPath, sourcePath), "utf8");
  if (record.instrument.fileSha256[sourcePath] !== sha256(source)) {
    throw new Error(
      `Grader source differs from the frozen member: ${sourcePath}`,
    );
  }
}

const artifact = async (
  relativePath: string,
  content?: string,
): Promise<{ readonly path: string; readonly content: string }> => ({
  path: relativePath,
  content:
    content ?? (await readFile(join(repositoryRootPath, relativePath), "utf8")),
});

const graderPromptPath =
  mode === "omniscient"
    ? "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/omniscient-grader.md"
    : "libs/@hashintel/brunch-agent/evaluations/protocols/ir-quality-ruler-v1/cold-ir-reviewer.md";
const graderInstructions = await readFile(
  join(repositoryRootPath, graderPromptPath),
  "utf8",
);
const inputs =
  mode === "omniscient"
    ? [
        await artifact(
          "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/situation-pack.md",
        ),
        await artifact(
          "libs/@hashintel/brunch-agent/evaluations/oracles/vestera-scheduling/truth-ledger-v1-prospective.yaml",
        ),
        await artifact(
          `${basename(artifactBase)}.transcript.md`,
          record.transcript,
        ),
        await artifact(`${basename(artifactBase)}.ir.md`, ir),
      ]
    : [
        await artifact(
          "libs/@hashintel/brunch-agent/evaluations/cases/vestera-scheduling/opening-message.md",
        ),
        await artifact(`${basename(artifactBase)}.ir.md`, ir),
      ];

const userPrompt = [
  `Grade run ${record.runId}.`,
  `Exactly ${inputs.length} artifact contents follow. Treat each declared path as its identity and use no other evidence.`,
  ...inputs.map(
    (input, index) =>
      `\n--- artifact ${index + 1}: ${input.path} (sha256 ${sha256(input.content)}) ---\n${input.content}\n--- end artifact ${index + 1} ---`,
  ),
].join("\n");

const response = await new Anthropic({
  maxRetries: 2,
  timeout: 10 * 60 * 1000,
}).messages.create({
  model: requestedModel,
  max_tokens: 16_000,
  thinking: { type: "disabled" },
  system: graderInstructions,
  messages: [{ role: "user", content: userPrompt }],
});
const report = response.content
  .filter(
    (
      block,
    ): block is Extract<(typeof response.content)[number], { type: "text" }> =>
      block.type === "text" && typeof block.text === "string",
  )
  .map((block) => block.text)
  .join("\n")
  .trim();
if (report.length === 0) {
  throw new Error(`The ${mode} grader returned no report.`);
}

let scoreValidation:
  | ReturnType<typeof scoreReport>
  | { readonly error: string; readonly valid: false };
try {
  scoreValidation = scoreReport(mode, report);
} catch (error) {
  scoreValidation = {
    error: error instanceof Error ? error.message : String(error),
    valid: false,
  };
}
const complete = response.stop_reason === "end_turn" && scoreValidation.valid;

const outputSuffix =
  attempt === undefined ? mode : `${mode}-attempt-${attempt}`;
const reportPath = `${artifactBase}.${outputSuffix}.md`;
const metadataPath = `${artifactBase}.${outputSuffix}.meta.json`;
await writeFile(reportPath, `${report}\n`, { flag: "wx" });
await writeFile(
  metadataPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      protocolId,
      outputNamespaceId,
      replication: record.replication,
      runId: record.runId,
      campaignFingerprint: record.campaignFingerprint,
      comparisonTarget: record.comparisonTarget,
      mode,
      attempt: attempt === undefined ? 1 : Number(attempt),
      graderPromptPath,
      graderPromptSha256: sha256(graderInstructions),
      inputSha256: Object.fromEntries(
        inputs.map((input) => [input.path, sha256(input.content)]),
      ),
      requestSha256: sha256(userPrompt),
      requestedModel,
      observedModel: response.model,
      stopReason: response.stop_reason,
      complete,
      scoreValidation,
      usage: response.usage,
      reportPath,
      reportSha256: sha256(report),
      completedAt: new Date().toISOString(),
      nonce: randomUUID(),
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);

process.stdout.write(
  `ARCHITECTURE_V5_GRADE ${JSON.stringify({
    mode,
    runId: record.runId,
    requestedModel,
    observedModel: response.model,
    stopReason: response.stop_reason,
    complete,
    scoreValidation,
    reportPath,
    metadataPath,
  })}\n`,
);
if (!complete) process.exitCode = 1;
