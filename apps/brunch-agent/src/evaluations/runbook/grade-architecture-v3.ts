import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

const repositoryRootPath = resolve(import.meta.dirname, "../../../../..");
const candidateDirectory = join(
  repositoryRootPath,
  "libs/@hashintel/brunch-agent/docs/evidence/evaluations/vestera-architecture-candidate-v3",
);
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
  !basename(artifactBase).startsWith("prospective-runbook-v3-replication-")
) {
  throw new Error(
    "The grader accepts only a v3 artifact in the frozen candidate namespace.",
  );
}

interface CandidateRecord {
  readonly campaignFingerprint: string;
  readonly comparisonTarget: unknown;
  readonly runId: string;
  readonly status: string;
  readonly transcript: string;
  readonly workpiece?: {
    readonly content: string;
    readonly sha256: string;
  };
}

const record = JSON.parse(
  await readFile(`${artifactBase}.json`, "utf8"),
) as CandidateRecord;
if (record.status !== "completed" || record.workpiece === undefined) {
  throw new Error("Only a completed v3 workpiece may be graded.");
}

const sha256 = (content: string): string =>
  createHash("sha256").update(content).digest("hex");
const ir = (await readFile(`${artifactBase}.ir.md`, "utf8")).trimEnd();
if (ir !== record.workpiece.content || sha256(ir) !== record.workpiece.sha256) {
  throw new Error(
    "The selected workpiece does not match its candidate record.",
  );
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
      protocolId: "prospective-runbook-v3",
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
  `ARCHITECTURE_V3_GRADE ${JSON.stringify({
    mode,
    runId: record.runId,
    requestedModel,
    observedModel: response.model,
    stopReason: response.stop_reason,
    reportPath,
    metadataPath,
  })}\n`,
);
