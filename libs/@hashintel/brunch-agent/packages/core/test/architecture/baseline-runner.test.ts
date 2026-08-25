import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import * as v from "valibot";
import { afterEach, describe, expect, test } from "vitest";

import {
  CONDITION_3_DEMAND_CLAUSES,
  CONDITION_3_INSTRUMENT_VERSION,
  CONDITION_3_LOCKED_PATHS,
} from "../../../../evaluations/protocols/process-model-elicitation/baseline/condition-3-instrument";
import { CONTEXT_ROOT, contextRootPresent } from "./workspace";

import type { StubReply } from "./fixtures/baseline-anthropic-stub";

const BASELINE_PROTOCOL_DIR = join(
  CONTEXT_ROOT,
  "evaluations/protocols/process-model-elicitation/baseline",
);
const BASELINE_CASE_DIR = join(
  CONTEXT_ROOT,
  "evaluations/cases/process-model-elicitation/baseline",
);
const BASELINE_EVIDENCE_DIR = join(
  CONTEXT_ROOT,
  "docs/evidence/evaluations/process-model-elicitation/baseline",
);
const STUB_MODULE = pathToFileURL(
  join(import.meta.dirname, "fixtures/baseline-anthropic-stub.ts"),
).href;
const temporaryDirectories: string[] = [];

interface BaselineCopy {
  outputDirectory: string;
  protocolDirectory: string;
  testDirectory: string;
}

const BaselineCheckpoint = v.object({
  condition: v.picklist(["1", "2", "3"]),
  stopReason: v.string(),
  calls: v.array(v.unknown()),
  interviewerMessages: v.array(
    v.object({
      role: v.picklist(["user", "assistant"]),
      content: v.string(),
      truncated: v.optional(v.boolean()),
      continuations: v.optional(
        v.array(
          v.object({
            content: v.string(),
            truncated: v.boolean(),
            recordedAt: v.string(),
          }),
        ),
      ),
    }),
  ),
  preregistration: v.optional(
    v.object({
      sha256: v.string(),
      verifiedBeforeRun: v.boolean(),
    }),
  ),
  operatorProjections: v.optional(
    v.array(
      v.object({
        turn: v.number(),
        activeObjectiveRows: v.array(v.string()),
        unsupportedActiveObjectiveAnchors: v.array(v.unknown()),
        selectedClauseId: v.nullable(v.string()),
        selectedUnsupportedAnchorLabel: v.nullable(v.string()),
        selectedCardId: v.nullable(v.string()),
        selectedPredicate: v.nullable(v.string()),
        activationMatches: v.array(
          v.object({
            cardId: v.string(),
            clauseId: v.string(),
            predicate: v.string(),
          }),
        ),
        noProgressStreak: v.number(),
        noProgressAdvisory: v.boolean(),
      }),
    ),
  ),
  operatorAttempts: v.optional(
    v.array(
      v.object({
        turn: v.number(),
        attempt: v.number(),
        parseError: v.nullable(v.string()),
      }),
    ),
  ),
  impatienceProbeTurn: v.optional(v.number()),
  genQ02Layer2: v.optional(
    v.object({
      cardId: v.literal("GEN-Q02"),
      verdict: v.literal("unobservable"),
      reason: v.string(),
    }),
  ),
  recovery: v.optional(
    v.object({
      mode: v.picklist(["resume", "continue-final"]),
      sourceRawPath: v.string(),
      sourceSha256: v.string(),
      seams: v.array(
        v.object({
          kind: v.picklist([
            "truncated-expert-regeneration",
            "truncated-interviewer-regeneration",
            "final-continuation",
          ]),
          sourceHadTruncationMarker: v.literal(true),
          sourceContent: v.string(),
          recordedAt: v.string(),
        }),
      ),
    }),
  ),
});

const BaselineRequest = v.object({
  model: v.string(),
  system: v.optional(v.string()),
  messages: v.array(v.record(v.string(), v.unknown())),
});

const FIRST_EXPERT_EVIDENCE = [
  "The objective is to test scheduling decisions before committing the weekly plan.",
  "We schedule customer orders on two coating lines.",
  "Operators run coating batches.",
  "Orders flow from release through line assignment to production and shipment.",
  "A large order may be split into contiguous runs.",
  "I do not know the ordinary minimum run range.",
  "Both lines can run the same eligible coating family.",
  "Split runs stay contiguous in the weekly sequence.",
  "A split normally adds one or two extra changeovers.",
  "Repeated ramp scrap is usually 20 to 40 units.",
].join(" ");

const evidenceByClause = {
  "SF-OBJ": FIRST_EXPERT_EVIDENCE.split(". ")[0] + ".",
  "SF-ENT": "We schedule customer orders on two coating lines.",
  "SF-ACT": "Operators run coating batches.",
  "SF-PATH":
    "Orders flow from release through line assignment to production and shipment.",
  "SF-FLOW":
    "Orders flow from release through line assignment to production and shipment.",
  "SP-BATCH": "A large order may be split into contiguous runs.",
  "SP-MIN": "I do not know the ordinary minimum run range.",
  "SP-ELIG": "Both lines can run the same eligible coating family.",
  "SP-POL": "Split runs stay contiguous in the weekly sequence.",
  "SP-CO": "A split normally adds one or two extra changeovers.",
  "SP-SCRAP": "Repeated ramp scrap is usually 20 to 40 units.",
} as const;

function condition3Projection(
  options: {
    minimumEvidence?: { turn: number; quote: string };
    minimumPass?: boolean;
  } = {},
) {
  return {
    activeObjectiveRows: ["ROW-SPLIT"],
    activeObjectiveRowEvidence: [
      {
        row: "ROW-SPLIT",
        anchorLabel: "split-large-orders",
        matchingPredicate: "split-run",
        evidence: [
          {
            turn: 1,
            quote: "A large order may be split into contiguous runs.",
          },
        ],
        rationale: "The expert explicitly describes split orders.",
      },
    ],
    retractedObjectiveAnchors: [],
    unsupportedActiveObjectiveAnchors: [],
    assessments: CONDITION_3_DEMAND_CLAUSES.map((clause) => {
      const demanded = clause.row === null || clause.row === "ROW-SPLIT";
      const isPresenceDemand = clause.demand.startsWith("presence count >=");
      const isSelectedFailure = clause.id === "SP-MIN";
      const quote =
        clause.id === "SP-MIN" && options.minimumEvidence
          ? options.minimumEvidence
          : clause.id in evidenceByClause
            ? {
                turn: 1,
                quote:
                  evidenceByClause[clause.id as keyof typeof evidenceByClause],
              }
            : undefined;
      return {
        clauseId: clause.id,
        demand: clause.demand,
        demanded,
        coordinate: clause.coordinate,
        currentStatus: demanded ? "explicit" : "not-applicable",
        currentGrade: demanded
          ? isPresenceDemand
            ? "none"
            : isSelectedFailure && !options.minimumPass
              ? "verbal"
              : clause.id === "SP-MIN" ||
                  clause.id === "SP-CO" ||
                  clause.id === "SP-SCRAP"
                ? "range"
                : "structured"
          : "not-applicable",
        pass: demanded
          ? !isSelectedFailure || options.minimumPass === true
          : true,
        failureDiagnostic:
          isSelectedFailure && !options.minimumPass
            ? "below-required-grade"
            : null,
        activationPredicates:
          isSelectedFailure && !options.minimumPass
            ? ["below-demanded-grade"]
            : [],
        evidence: demanded && quote ? [quote] : [],
        observedCount: isPresenceDemand
          ? clause.id === "SF-ENT"
            ? 2
            : 1
          : null,
        rationale: "operator-only test rationale",
      };
    }),
    notes: ["test projection"],
  };
}

function condition3NoProgressProjection() {
  return {
    activeObjectiveRows: [],
    activeObjectiveRowEvidence: [],
    retractedObjectiveAnchors: [],
    unsupportedActiveObjectiveAnchors: [],
    assessments: CONDITION_3_DEMAND_CLAUSES.map((clause) =>
      clause.row === null
        ? {
            clauseId: clause.id,
            demand: clause.demand,
            coordinate: clause.coordinate,
            demanded: true,
            currentStatus: "none",
            currentGrade: "none",
            pass: false,
            failureDiagnostic: clause.demand.startsWith("presence count >=")
              ? "below-minimum-count"
              : "unaddressed",
            activationPredicates: [],
            evidence: [],
            observedCount: clause.demand.startsWith("presence count >=")
              ? 0
              : null,
            rationale: "No transcript evidence was added.",
          }
        : {
            clauseId: clause.id,
            demand: clause.demand,
            coordinate: clause.coordinate,
            demanded: false,
            currentStatus: "not-applicable",
            currentGrade: "not-applicable",
            pass: true,
            failureDiagnostic: null,
            activationPredicates: [],
            evidence: [],
            observedCount: null,
            rationale: "Inactive objective row.",
          },
    ),
    notes: [],
  };
}

async function copyDirectoryContents(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  await Promise.all(
    (await readdir(sourceDirectory)).map((entry) =>
      cp(join(sourceDirectory, entry), join(destinationDirectory, entry), {
        recursive: true,
      }),
    ),
  );
}

async function createBaselineCopy(): Promise<BaselineCopy> {
  const testDirectory = await mkdtemp(join(tmpdir(), "baseline-runner-test-"));
  temporaryDirectories.push(testDirectory);
  const protocolDirectory = join(
    testDirectory,
    "evaluations/protocols/process-model-elicitation/baseline",
  );
  const caseDirectory = join(
    testDirectory,
    "evaluations/cases/process-model-elicitation/baseline",
  );
  const completionSpecDirectory = join(testDirectory, "docs/specs");
  const researchDirectory = join(
    testDirectory,
    "docs/reference/research/elicitation",
  );
  const evidenceDirectory = join(
    testDirectory,
    "docs/evidence/evaluations/process-model-elicitation/baseline",
  );
  await Promise.all([
    mkdir(protocolDirectory, { recursive: true }),
    mkdir(caseDirectory, { recursive: true }),
    mkdir(completionSpecDirectory, { recursive: true }),
    mkdir(researchDirectory, { recursive: true }),
    mkdir(evidenceDirectory, { recursive: true }),
  ]);
  await Promise.all([
    copyDirectoryContents(BASELINE_PROTOCOL_DIR, protocolDirectory),
    copyDirectoryContents(BASELINE_CASE_DIR, caseDirectory),
    copyDirectoryContents(BASELINE_EVIDENCE_DIR, evidenceDirectory),
    cp(
      join(CONTEXT_ROOT, "docs/specs/elicitation-completion.md"),
      join(completionSpecDirectory, "elicitation-completion.md"),
    ),
    cp(
      join(CONTEXT_ROOT, "docs/specs/cps-interview-guidance.md"),
      join(completionSpecDirectory, "cps-interview-guidance.md"),
    ),
    cp(
      join(
        CONTEXT_ROOT,
        "docs/reference/research/elicitation/frontier-model-elicitor-failure-catalogue.md",
      ),
      join(researchDirectory, "frontier-model-elicitor-failure-catalogue.md"),
    ),
  ]);
  await symlink(
    join(CONTEXT_ROOT, "../../../node_modules"),
    join(testDirectory, "node_modules"),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const files = await Promise.all(
    CONDITION_3_LOCKED_PATHS.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(testDirectory, path), "utf8"))
        .digest("hex"),
    })),
  );
  await writeFile(
    join(protocolDirectory, "condition-3-preregistration.lock.json"),
    JSON.stringify(
      {
        version: CONDITION_3_INSTRUMENT_VERSION,
        sealedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
  );
  return {
    outputDirectory: join(testDirectory, "test-output"),
    protocolDirectory,
    testDirectory,
  };
}

async function runBaseline(
  baselineCopy: BaselineCopy,
  replies: StubReply[],
  condition: "1" | "2" | "3" = "1",
  mode?: "--resume" | "--continue-final",
): Promise<{
  checkpoint: v.InferOutput<typeof BaselineCheckpoint>;
  stderr: string;
  requests: Array<v.InferOutput<typeof BaselineRequest>>;
}> {
  const requestsPath = join(baselineCopy.testDirectory, "requests.jsonl");
  const subprocess = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      join(baselineCopy.protocolDirectory, "run.ts"),
      condition,
      ...(mode ? [mode] : []),
    ],
    {
      cwd: baselineCopy.testDirectory,
      env: {
        ...process.env,
        BRUNCH_BASELINE_ANTHROPIC_MODULE: STUB_MODULE,
        BRUNCH_BASELINE_TEST_OUTPUT_DIR: baselineCopy.outputDirectory,
        BASELINE_STUB_REPLIES: JSON.stringify(replies),
        BASELINE_STUB_REQUESTS_PATH: requestsPath,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  subprocess.stderr.setEncoding("utf8");
  let stderr = "";
  subprocess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    subprocess.once("error", reject);
    subprocess.once("close", resolve);
  });
  expect(exitCode, stderr).toBe(0);

  const checkpoint = v.parse(
    BaselineCheckpoint,
    JSON.parse(
      await readFile(
        join(
          baselineCopy.outputDirectory,
          (await readdir(baselineCopy.outputDirectory))
            .filter(
              (name) =>
                name.startsWith(`condition-${condition}`) &&
                name.endsWith(".raw.json"),
            )
            .sort()
            .at(-1) ?? `condition-${condition}.raw.json`,
        ),
        "utf8",
      ),
    ) as unknown,
  );
  const requests = (await readFile(requestsPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => v.parse(BaselineRequest, JSON.parse(line) as unknown));
  return { checkpoint, stderr, requests };
}

async function runBaselineFailure(
  baselineCopy: BaselineCopy,
  replies: StubReply[],
  mode?: "--resume" | "--continue-final",
): Promise<{
  checkpoint?: v.InferOutput<typeof BaselineCheckpoint>;
  stderr: string;
  requests: Array<v.InferOutput<typeof BaselineRequest>>;
}> {
  const requestsPath = join(baselineCopy.testDirectory, "requests.jsonl");
  const subprocess = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      join(baselineCopy.protocolDirectory, "run.ts"),
      "3",
      ...(mode ? [mode] : []),
    ],
    {
      cwd: baselineCopy.testDirectory,
      env: {
        ...process.env,
        BRUNCH_BASELINE_ANTHROPIC_MODULE: STUB_MODULE,
        BRUNCH_BASELINE_TEST_OUTPUT_DIR: baselineCopy.outputDirectory,
        BASELINE_STUB_REPLIES: JSON.stringify(replies),
        BASELINE_STUB_REQUESTS_PATH: requestsPath,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  subprocess.stderr.setEncoding("utf8");
  let stderr = "";
  subprocess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    subprocess.once("error", reject);
    subprocess.once("close", resolve);
  });
  expect(exitCode).toBe(1);

  const requests = existsSync(requestsPath)
    ? (await readFile(requestsPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => v.parse(BaselineRequest, JSON.parse(line) as unknown))
    : [];
  const rawFiles = existsSync(baselineCopy.outputDirectory)
    ? readdir(baselineCopy.outputDirectory)
    : Promise.resolve([]);
  const latestRawFile = (await rawFiles)
    .filter((name) => name.endsWith(".raw.json"))
    .sort()
    .at(-1);
  const checkpoint = latestRawFile
    ? v.parse(
        BaselineCheckpoint,
        JSON.parse(
          await readFile(
            join(baselineCopy.outputDirectory, latestRawFile),
            "utf8",
          ),
        ) as unknown,
      )
    : undefined;
  return { checkpoint, stderr, requests };
}

async function mutateCondition3Lock(
  baselineCopy: BaselineCopy,
  mutate: (lock: Condition3Lock) => Condition3Lock,
): Promise<void> {
  const lockPath = join(
    baselineCopy.protocolDirectory,
    "condition-3-preregistration.lock.json",
  );
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as Condition3Lock;
  await writeFile(lockPath, JSON.stringify(mutate(lock), null, 2));
}

interface Condition3Lock {
  version: string;
  sealedAt: string;
  files: Array<{ path: string; sha256: string }>;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(!contextRootPresent)(
  "baseline runner completion metadata",
  () => {
    test("rejects an output override without the stub module before API calls or output", async () => {
      const baselineCopy = await createBaselineCopy();
      let apiCalls = 0;
      const server = createServer((_request, response) => {
        apiCalls += 1;
        response.writeHead(500).end();
      });
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected the test API server to listen on a TCP port");
      }

      const { BRUNCH_BASELINE_ANTHROPIC_MODULE: _stubModule, ...env } =
        process.env;
      const subprocess = spawn(
        process.execPath,
        [
          "--experimental-strip-types",
          join(baselineCopy.protocolDirectory, "run.ts"),
          "1",
        ],
        {
          cwd: baselineCopy.testDirectory,
          env: {
            ...env,
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
            BRUNCH_BASELINE_TEST_OUTPUT_DIR: baselineCopy.outputDirectory,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      subprocess.stderr.setEncoding("utf8");
      let stderr = "";
      subprocess.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        subprocess.once("error", reject);
        subprocess.once("close", resolve);
      });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        "BRUNCH_BASELINE_TEST_OUTPUT_DIR requires BRUNCH_BASELINE_ANTHROPIC_MODULE",
      );
      expect(apiCalls).toBe(0);
      expect(existsSync(baselineCopy.outputDirectory)).toBe(false);
    });

    test("checkpoints a truncated expert reply and stops before another interviewer call", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(testDirectory, [
        { text: "What happens next?" },
        { text: "NO" },
        { text: "The operator begins to explain", truncated: true },
      ]);

      expect(result.checkpoint.calls).toHaveLength(3);
      expect(result.checkpoint.stopReason).toBe("expert-truncated");
      expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "user",
        content: "The operator begins to explain",
        truncated: true,
      });
      expect(result.stderr).toContain("expert reply is truncated");
    });

    test("preserves the condition 2 prompt and legacy completion path", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(
        testDirectory,
        [{ text: "Final structured model" }, { text: "YES" }],
        "2",
      );

      expect(result.checkpoint.stopReason).toBe("delivered");
      expect(result.requests[0]?.system).toContain(
        "You are an expert process-model elicitor",
      );
      expect(result.requests[0]?.system).not.toContain(
        "test-only completion operator",
      );
    });

    test("resume regenerates a trailing truncated expert reply before continuing", async () => {
      const testDirectory = await createBaselineCopy();
      await runBaseline(testDirectory, [
        { text: "What happens next?" },
        { text: "NO" },
        { text: "Partial expert reply", truncated: true },
      ]);

      const resumed = await runBaseline(
        testDirectory,
        [
          { text: "Complete expert reply" },
          { text: "Final model" },
          { text: "YES" },
        ],
        "1",
        "--resume",
      );

      expect(resumed.checkpoint.stopReason).toBe("delivered");
      expect(resumed.checkpoint.interviewerMessages).toEqual([
        expect.objectContaining({ role: "user" }),
        { role: "assistant", content: "What happens next?" },
        { role: "user", content: "Complete expert reply" },
        { role: "assistant", content: "Final model" },
      ]);
      expect(resumed.stderr).toContain("regenerating truncated expert reply");
    });

    test("checkpoints a capped non-final interviewer reply and stops before calling the expert", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(testDirectory, [
        { text: "part-1", truncated: true },
        { text: "part-2", truncated: true },
        { text: "part-3", truncated: true },
        { text: "part-4", truncated: true },
        { text: "part-5", truncated: true },
        { text: "NO" },
      ]);

      expect(result.checkpoint.calls).toHaveLength(6);
      expect(result.checkpoint.stopReason).toBe("interviewer-truncated");
      expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "assistant",
        content: "part-1part-2part-3part-4part-5",
        truncated: true,
      });
      expect(result.stderr).toContain(
        "non-final interviewer reply is truncated",
      );
    });

    test("continues a truncated final delivery without sending checkpoint metadata", async () => {
      const testDirectory = await createBaselineCopy();
      await runBaseline(testDirectory, [
        { text: "part-1", truncated: true },
        { text: "part-2", truncated: true },
        { text: "part-3", truncated: true },
        { text: "part-4", truncated: true },
        { text: "part-5", truncated: true },
        { text: "YES" },
      ]);
      await rm(join(testDirectory.testDirectory, "requests.jsonl"));

      const continued = await runBaseline(
        testDirectory,
        [{ text: " continued" }],
        "1",
        "--continue-final",
      );

      expect(continued.requests).toHaveLength(1);
      expect(continued.requests[0]?.messages).toEqual([
        expect.objectContaining({ role: "user" }),
        { role: "assistant", content: "part-1part-2part-3part-4part-5" },
        {
          role: "user",
          content:
            "You were cut off mid-document. Continue exactly from where you stopped — no preamble, no repetition.",
        },
      ]);
      for (const message of continued.requests[0]?.messages ?? []) {
        expect(Object.keys(message).sort()).toEqual(["content", "role"]);
      }
      expect(continued.checkpoint.stopReason).toBe("delivered");
      expect(continued.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "assistant",
        content: "part-1part-2part-3part-4part-5 continued",
      });
    });

    test("runs condition 3 with a preregistered operator projection", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(
        testDirectory,
        [
          { text: "What decision should the model support?" },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "What ordinary minimum run range applies?" },
          { text: "NO" },
          { text: "Usually 800 to 1,200 units." },
          {
            text: JSON.stringify(
              condition3Projection({
                minimumEvidence: {
                  turn: 2,
                  quote: "Usually 800 to 1,200 units.",
                },
                minimumPass: true,
              }),
            ),
          },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(result.checkpoint.stopReason).toBe("delivered");
      expect(result.checkpoint).toMatchObject({
        condition: "3",
        preregistration: {
          verifiedBeforeRun: true,
        },
        operatorProjections: [
          expect.objectContaining({
            turn: 1,
            activeObjectiveRows: ["ROW-SPLIT"],
            selectedClauseId: "SP-MIN",
            selectedCardId: "CPS-Q03",
            selectedPredicate: "below-demanded-grade",
          }),
          expect.objectContaining({ turn: 2 }),
        ],
      });
      expect(result.checkpoint.preregistration?.sha256).toMatch(
        /^[a-f0-9]{64}$/u,
      );

      const firstInterviewer = result.requests[0];
      const firstExpert = result.requests[2];
      const firstOperator = result.requests[3];
      const secondInterviewer = result.requests[4];
      const secondExpert = result.requests[6];

      expect(firstInterviewer?.system).toContain(
        "This is a single-session experiment",
      );
      expect(firstInterviewer?.system).not.toContain("Marta Iversen");
      expect(firstExpert?.system).toContain("Marta Iversen");
      expect(firstExpert?.system).not.toContain("FROZEN_DEMAND_TABLE");
      expect(firstOperator?.system).toContain("FROZEN_DEMAND_TABLE");
      expect(firstOperator?.system).toContain("PROJECTION_ENVELOPE");
      expect(firstOperator?.system).toContain('"assessmentStates"');
      expect(firstOperator?.system).toContain('"matchingPredicate"');
      expect(firstOperator?.system).toContain('"split-run"');
      expect(firstOperator?.system).toContain('"failureDiagnostic"');
      expect(firstOperator?.system).toContain('"absence-uncorroborated"');
      expect(firstOperator?.system).not.toContain("Marta Iversen");
      expect(JSON.stringify(firstOperator?.messages)).toContain(
        "Repeated ramp scrap is usually 20 to 40 units.",
      );
      expect(JSON.stringify(secondInterviewer?.messages)).toContain(
        "<test-only-completion-diagnostic>",
      );
      expect(JSON.stringify(secondInterviewer?.messages)).not.toContain(
        "operator-only test rationale",
      );
      expect(JSON.stringify(secondExpert?.messages)).not.toContain(
        "test-only-completion-diagnostic",
      );
      expect(JSON.stringify(result.requests[7]?.messages)).toContain(
        "floor huddle in ten minutes",
      );
      expect(result.checkpoint.impatienceProbeTurn).toBe(2);
      expect(result.checkpoint.genQ02Layer2).toMatchObject({
        cardId: "GEN-Q02",
        verdict: "unobservable",
      });
      expect(
        result.checkpoint.operatorProjections?.flatMap(
          ({ activationMatches }) => activationMatches,
        ),
      ).not.toContainEqual(expect.objectContaining({ cardId: "GEN-Q02" }));
    });

    test("selects a transcript-supported unsupported active objective before frozen rows", async () => {
      const baselineCopy = await createBaselineCopy();
      const unsupportedProjection = {
        ...condition3Projection(),
        assessments: condition3Projection().assessments.map((assessment) =>
          assessment.clauseId === "SF-OBJ"
            ? {
                ...assessment,
                observedCount: 2,
                evidence: [
                  ...assessment.evidence,
                  { turn: 1, quote: "minimize energy use" },
                ],
              }
            : assessment,
        ),
        unsupportedActiveObjectiveAnchors: [
          {
            label: "energy-use",
            state: "active",
            demanded: true,
            pass: false,
            failureDiagnostic: "unsupported-active-anchor",
            evidence: [
              {
                turn: 1,
                quote: "minimize energy use",
              },
            ],
            resolutionEvidence: [],
            resolutionRationale: null,
            rationale:
              "The frozen objective rows do not represent this objective.",
          },
        ],
      };
      const result = await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: `${FIRST_EXPERT_EVIDENCE} We also minimize energy use.` },
          { text: JSON.stringify(unsupportedProjection) },
          { text: "What frozen demand is still open?" },
          { text: "NO" },
          { text: "The ordinary minimum is still unknown." },
          {
            text: JSON.stringify({
              ...condition3Projection({
                minimumEvidence: {
                  turn: 2,
                  quote: "The ordinary minimum is still unknown.",
                },
              }),
              assessments: condition3Projection({
                minimumEvidence: {
                  turn: 2,
                  quote: "The ordinary minimum is still unknown.",
                },
              }).assessments.map((assessment) =>
                assessment.clauseId === "SF-OBJ"
                  ? {
                      ...assessment,
                      observedCount: 2,
                      evidence: [
                        ...assessment.evidence,
                        { turn: 1, quote: "minimize energy use" },
                      ],
                    }
                  : assessment,
              ),
              unsupportedActiveObjectiveAnchors:
                unsupportedProjection.unsupportedActiveObjectiveAnchors,
            }),
          },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(result.checkpoint.operatorProjections?.[0]).toMatchObject({
        selectedClauseId: null,
        selectedUnsupportedAnchorLabel: "energy-use",
        selectedCardId: null,
        selectedPredicate: null,
      });
      expect(JSON.stringify(result.requests[4]?.messages)).toContain(
        "clause=unsupported-active-anchor",
      );
      expect(result.checkpoint.operatorProjections?.[1]).toMatchObject({
        selectedClauseId: "SP-MIN",
        selectedUnsupportedAnchorLabel: null,
        selectedCardId: "CPS-Q03",
        selectedPredicate: "below-demanded-grade",
      });
    });

    test("treats forced wrap as a stimulus and never as an expert/operator frame", async () => {
      const baselineCopy = await createBaselineCopy();
      const replies: StubReply[] = [];
      for (let turn = 1; turn <= 19; turn++) {
        const minimumQuote =
          turn === 1
            ? evidenceByClause["SP-MIN"]
            : `Ordinary minimum range remains unknown at turn ${turn}.`;
        replies.push(
          { text: `Question ${turn}.` },
          { text: "NO" },
          {
            text: turn === 1 ? FIRST_EXPERT_EVIDENCE : minimumQuote,
          },
          {
            text: JSON.stringify(
              condition3Projection({
                minimumEvidence: { turn, quote: minimumQuote },
              }),
            ),
          },
        );
      }
      replies.push({ text: "Final model after forced wrap." }, { text: "YES" });

      const result = await runBaseline(baselineCopy, replies, "3");

      expect(result.checkpoint.stopReason).toBe("delivered-after-forced-wrap");
      expect(result.checkpoint.operatorProjections).toHaveLength(19);
      expect(
        result.checkpoint.interviewerMessages.some(
          ({ content }) =>
            content.includes("<EXPERIMENT_STIMULUS>") &&
            content.includes("Please produce the model now"),
        ),
      ).toBe(true);
      expect(
        result.requests.filter(({ system }) =>
          system?.includes("test-only completion operator"),
        ),
      ).toHaveLength(19);
      expect(JSON.stringify(result.requests[76]?.messages)).toContain(
        "Please produce the model now",
      );
      expect(
        result.requests
          .filter(({ system }) => system?.includes("Marta Iversen"))
          .some(({ messages }) =>
            JSON.stringify(messages).includes("Please produce the model now"),
          ),
      ).toBe(false);
    });

    test("resumes after a completed forced-wrap turn without regenerating or duplicating it", async () => {
      const baselineCopy = await createBaselineCopy();
      const replies: StubReply[] = [];
      for (let turn = 1; turn <= 19; turn++) {
        const minimumQuote =
          turn === 1
            ? evidenceByClause["SP-MIN"]
            : `Ordinary minimum range remains unknown at turn ${turn}.`;
        replies.push(
          { text: `Question ${turn}.` },
          { text: "NO" },
          { text: turn === 1 ? FIRST_EXPERT_EVIDENCE : minimumQuote },
          {
            text: JSON.stringify(
              condition3Projection({
                minimumEvidence: { turn, quote: minimumQuote },
              }),
            ),
          },
        );
      }
      replies.push({ text: "Question 20." }, { text: "NO" });

      const interrupted = await runBaselineFailure(baselineCopy, replies);
      expect(interrupted.checkpoint?.stopReason).toBe(
        "forced-wrap-in-progress",
      );
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const resumed = await runBaseline(
        baselineCopy,
        [{ text: "Final model on turn 21." }, { text: "YES" }],
        "3",
        "--resume",
      );

      expect(resumed.checkpoint.stopReason).toBe("delivered-after-forced-wrap");
      expect(
        resumed.checkpoint.interviewerMessages.filter(({ content }) =>
          content.includes("<EXPERIMENT_STIMULUS>"),
        ),
      ).toHaveLength(2);
      expect(
        resumed.checkpoint.interviewerMessages.filter(
          ({ content }) => content === "Question 20.",
        ),
      ).toHaveLength(1);
    });

    test("supplies every stitched non-final interviewer piece to expert, operator, and later interviewer views", async () => {
      const baselineCopy = await createBaselineCopy();
      const result = await runBaseline(
        baselineCopy,
        [
          { text: "Question part one ", truncated: true },
          { text: "and part two." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      for (const requestIndex of [3, 4, 5]) {
        expect(
          JSON.stringify(result.requests[requestIndex]?.messages),
        ).toContain("Question part one and part two.");
      }
      expect(result.checkpoint.interviewerMessages[1]).toMatchObject({
        content: "Question part one ",
        continuations: [expect.objectContaining({ content: "and part two." })],
      });
    });

    test.each([
      [
        "missing",
        (files: Array<{ path: string; sha256: string }>) => files.slice(1),
      ],
      [
        "extra",
        (files: Array<{ path: string; sha256: string }>) => [
          ...files,
          { path: "unexpected.md", sha256: "0".repeat(64) },
        ],
      ],
      [
        "duplicate",
        (files: Array<{ path: string; sha256: string }>) => [
          ...files,
          files[0] as { path: string; sha256: string },
        ],
      ],
      [
        "reordered",
        (files: Array<{ path: string; sha256: string }>) =>
          [...files].reverse(),
      ],
      ["empty", () => []],
    ])(
      "rejects a %s condition-3 manifest before model calls",
      async (_name, mutate) => {
        const baselineCopy = await createBaselineCopy();
        await mutateCondition3Lock(baselineCopy, (lock) => ({
          ...lock,
          files: mutate(lock.files),
        }));

        const result = await runBaselineFailure(baselineCopy, []);

        expect(result.stderr).toMatch(
          /manifest is not canonical|invalid envelope/u,
        );
        expect(result.requests).toEqual([]);
      },
    );

    test("rejects a falsely early self-declared sealedAt", async () => {
      const baselineCopy = await createBaselineCopy();
      await mutateCondition3Lock(baselineCopy, (lock) => ({
        ...lock,
        sealedAt: "2000-01-01T00:00:00.000Z",
      }));

      const result = await runBaselineFailure(baselineCopy, []);

      expect(result.stderr).toContain(
        "condition-3 preregistration chronology is invalid",
      );
      expect(result.requests).toEqual([]);
    });

    test("retries malformed and contradictory operator projections before selection", async () => {
      const baselineCopy = await createBaselineCopy();
      const contradictory = condition3Projection();
      const minimum = contradictory.assessments.find(
        ({ clauseId }) => clauseId === "SP-MIN",
      );
      if (!minimum) throw new Error("fixture lost SP-MIN");
      minimum.pass = true;

      const result = await runBaseline(
        baselineCopy,
        [
          {
            text: "Give one cohesive overview of objective, entities, activities, flow, and split policy.",
          },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: "{}" },
          { text: JSON.stringify(contradictory) },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(result.checkpoint.operatorAttempts).toHaveLength(3);
      expect(result.checkpoint.operatorAttempts?.[0]?.attempt).toBe(1);
      expect(result.checkpoint.operatorAttempts?.[1]?.attempt).toBe(2);
      expect(typeof result.checkpoint.operatorAttempts?.[0]?.parseError).toBe(
        "string",
      );
      expect(typeof result.checkpoint.operatorAttempts?.[1]?.parseError).toBe(
        "string",
      );
      expect(result.checkpoint.operatorAttempts?.[2]).toMatchObject({
        attempt: 3,
        parseError: null,
      });
      expect(result.checkpoint.operatorProjections?.[0]?.selectedClauseId).toBe(
        "SP-MIN",
      );
    });

    test("retries an evidence quote absent from the supplied transcript", async () => {
      const baselineCopy = await createBaselineCopy();
      const invalidQuote = condition3Projection();
      const objective = invalidQuote.assessments.find(
        ({ clauseId }) => clauseId === "SF-OBJ",
      );
      if (!objective) throw new Error("fixture lost SF-OBJ");
      objective.evidence = [{ turn: 1, quote: "words never supplied" }];

      const result = await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(invalidQuote) },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(result.checkpoint.operatorAttempts?.[0]?.parseError).toContain(
        "does not occur in supplied transcript",
      );
      expect(result.checkpoint.operatorProjections).toHaveLength(1);
    });

    test("labels the single-session correction but rejects it as opening evidence", async () => {
      const baselineCopy = await createBaselineCopy();
      const stimulusEvidence = condition3Projection();
      const objective = stimulusEvidence.assessments.find(
        ({ clauseId }) => clauseId === "SF-OBJ",
      );
      if (!objective) throw new Error("fixture lost SF-OBJ");
      objective.evidence = [
        {
          turn: 0,
          quote: "No external data or later follow-up will arrive.",
        },
      ];

      const result = await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(stimulusEvidence) },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(JSON.stringify(result.requests[3]?.messages)).toContain(
        "<EXPERIMENT_STIMULUS>",
      );
      expect(result.checkpoint.operatorAttempts?.[0]?.parseError).toContain(
        "does not occur in supplied transcript",
      );
    });

    test("labels the impatience stimulus but rejects it as expert evidence", async () => {
      const baselineCopy = await createBaselineCopy();
      const stimulusEvidence = condition3Projection();
      const objective = stimulusEvidence.assessments.find(
        ({ clauseId }) => clauseId === "SF-OBJ",
      );
      if (!objective) throw new Error("fixture lost SF-OBJ");
      objective.evidence = [
        {
          turn: 2,
          quote: "floor huddle in ten minutes",
        },
      ];

      const result = await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Anything else?" },
          { text: "NO" },
          { text: "Nothing else." },
          { text: JSON.stringify(stimulusEvidence) },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
      );

      expect(JSON.stringify(result.requests[7]?.messages)).toContain(
        "<EXPERIMENT_STIMULUS>",
      );
      expect(result.checkpoint.operatorAttempts?.[1]?.parseError).toContain(
        "does not occur in supplied transcript",
      );
    });

    test("fails closed after exhausting malformed operator retries", async () => {
      const baselineCopy = await createBaselineCopy();
      const result = await runBaselineFailure(baselineCopy, [
        { text: "Describe the operation." },
        { text: "NO" },
        { text: FIRST_EXPERT_EVIDENCE },
        { text: "{}" },
        { text: "{}" },
        { text: "{}" },
      ]);

      expect(result.stderr).toContain(
        "condition-3 operator exhausted projection-validation attempts",
      );
      expect(result.checkpoint?.stopReason).toBe("operator-projection-failure");
      expect(result.checkpoint?.operatorAttempts).toHaveLength(3);
      expect(result.checkpoint?.operatorProjections).toEqual([]);
    });

    test("executes the semantic no-progress advisory and hard stop", async () => {
      const baselineCopy = await createBaselineCopy();
      const replies: StubReply[] = [];
      for (let turn = 1; turn <= 5; turn++) {
        replies.push(
          { text: `Prompt ${turn}.` },
          { text: "NO" },
          { text: "I have nothing to add." },
          { text: JSON.stringify(condition3NoProgressProjection()) },
        );
      }
      replies.push(
        { text: "Final limited model with explicit gaps." },
        { text: "YES" },
      );
      const result = await runBaseline(baselineCopy, replies, "3");

      expect(result.checkpoint.stopReason).toBe(
        "delivered-after-no-progress-hard-stop",
      );
      expect(
        result.checkpoint.operatorProjections?.map(
          ({ noProgressStreak }) => noProgressStreak,
        ),
      ).toEqual([1, 2, 3, 4, 5]);
      expect(
        result.checkpoint.operatorProjections?.[2]?.noProgressAdvisory,
      ).toBe(true);
      expect(result.requests).toHaveLength(22);
      expect(JSON.stringify(result.requests[20]?.messages)).toContain(
        "do not ask another question",
      );
    });

    test.each([
      "Give objective, entities, activities, flow, and split policy as one cohesive five-item overview.",
      "State the objective. Name the entities. Describe the activities. Explain the flow. Give the split rule.",
    ])(
      "keeps GEN-Q02 layer-2 unobservable for: %s",
      async (interviewerMessage) => {
        const baselineCopy = await createBaselineCopy();
        const result = await runBaseline(
          baselineCopy,
          [
            { text: interviewerMessage },
            { text: "NO" },
            { text: FIRST_EXPERT_EVIDENCE },
            { text: JSON.stringify(condition3Projection()) },
            { text: "Final model" },
            { text: "YES" },
          ],
          "3",
        );

        expect(result.checkpoint.genQ02Layer2?.verdict).toBe("unobservable");
        expect(
          result.checkpoint.operatorProjections?.[0]?.activationMatches,
        ).not.toContainEqual(expect.objectContaining({ cardId: "GEN-Q02" }));
      },
    );

    test.each(["--resume", "--continue-final"] as const)(
      "rejects a checkpoint seal mismatch on %s before model calls",
      async (recoveryMode) => {
        const baselineCopy = await createBaselineCopy();
        if (recoveryMode === "--resume") {
          await runBaseline(
            baselineCopy,
            [
              { text: "Describe the operation." },
              { text: "NO" },
              { text: "Partial expert evidence", truncated: true },
            ],
            "3",
          );
        } else {
          await runBaseline(
            baselineCopy,
            [
              { text: "part-1", truncated: true },
              { text: "part-2", truncated: true },
              { text: "part-3", truncated: true },
              { text: "part-4", truncated: true },
              { text: "part-5", truncated: true },
              { text: "YES" },
            ],
            "3",
          );
        }
        const rawPath = join(
          baselineCopy.outputDirectory,
          "condition-3.raw.json",
        );
        const raw = JSON.parse(await readFile(rawPath, "utf8")) as {
          preregistration: { sha256: string };
        };
        raw.preregistration.sha256 = "0".repeat(64);
        await writeFile(rawPath, JSON.stringify(raw, null, 2));
        await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

        const result = await runBaselineFailure(baselineCopy, [], recoveryMode);

        expect(result.stderr).toContain("checkpoint binding mismatch");
        expect(result.requests).toEqual([]);
      },
    );

    test("rejects semantically edited checkpoint projections before resume calls", async () => {
      const baselineCopy = await createBaselineCopy();
      await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "part-1", truncated: true },
          { text: "part-2", truncated: true },
          { text: "part-3", truncated: true },
          { text: "part-4", truncated: true },
          { text: "part-5", truncated: true },
          { text: "NO" },
        ],
        "3",
      );
      const rawPath = join(
        baselineCopy.outputDirectory,
        "condition-3.raw.json",
      );
      const raw = JSON.parse(await readFile(rawPath, "utf8")) as {
        operatorProjections: Array<{ noProgressStreak: number }>;
      };
      raw.operatorProjections[0]!.noProgressStreak = 999;
      await writeFile(rawPath, JSON.stringify(raw, null, 2));
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const result = await runBaselineFailure(baselineCopy, [], "--resume");

      expect(result.stderr).toContain(
        "checkpoint projection semantics disagree at turn 1",
      );
      expect(result.requests).toEqual([]);
    });

    test("resumes condition 3 into an append-only segment with a sealed source seam", async () => {
      const baselineCopy = await createBaselineCopy();
      await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: "Partial expert evidence", truncated: true },
        ],
        "3",
      );
      const sourcePath = join(
        baselineCopy.outputDirectory,
        "condition-3.raw.json",
      );
      const sourceContent = await readFile(sourcePath, "utf8");
      const sourceHash = createHash("sha256")
        .update(sourceContent)
        .digest("hex");
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const resumed = await runBaseline(
        baselineCopy,
        [
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
        "--resume",
      );

      expect(await readFile(sourcePath, "utf8")).toBe(sourceContent);
      expect(resumed.checkpoint.recovery).toMatchObject({
        mode: "resume",
        sourceRawPath: sourcePath,
        sourceSha256: sourceHash,
        seams: [
          expect.objectContaining({
            kind: "truncated-expert-regeneration",
            sourceHadTruncationMarker: true,
            sourceContent: "Partial expert evidence",
          }),
        ],
      });
    });

    test("records an append-only seam when regenerating a truncated interviewer turn", async () => {
      const baselineCopy = await createBaselineCopy();
      await runBaseline(
        baselineCopy,
        [
          { text: "part-1", truncated: true },
          { text: "part-2", truncated: true },
          { text: "part-3", truncated: true },
          { text: "part-4", truncated: true },
          { text: "part-5", truncated: true },
          { text: "NO" },
        ],
        "3",
      );
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const resumed = await runBaseline(
        baselineCopy,
        [
          { text: "Describe the operation." },
          { text: "NO" },
          { text: FIRST_EXPERT_EVIDENCE },
          { text: JSON.stringify(condition3Projection()) },
          { text: "Final model" },
          { text: "YES" },
        ],
        "3",
        "--resume",
      );

      expect(resumed.checkpoint.recovery?.seams).toContainEqual(
        expect.objectContaining({
          kind: "truncated-interviewer-regeneration",
          sourceHadTruncationMarker: true,
          sourceContent: "part-1part-2part-3part-4part-5",
        }),
      );
    });

    test("refuses to resume operator exhaustion before any further model call", async () => {
      const baselineCopy = await createBaselineCopy();
      await runBaselineFailure(baselineCopy, [
        { text: "Describe the operation." },
        { text: "NO" },
        { text: FIRST_EXPERT_EVIDENCE },
        { text: "{}" },
        { text: "{}" },
        { text: "{}" },
      ]);
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const refused = await runBaselineFailure(baselineCopy, [], "--resume");

      expect(refused.stderr).toContain("terminal checkpoint cannot resume");
      expect(refused.requests).toEqual([]);
    });

    test("continues condition 3 without overwriting or clearing the source truncation marker", async () => {
      const baselineCopy = await createBaselineCopy();
      await runBaseline(
        baselineCopy,
        [
          { text: "part-1", truncated: true },
          { text: "part-2", truncated: true },
          { text: "part-3", truncated: true },
          { text: "part-4", truncated: true },
          { text: "part-5", truncated: true },
          { text: "YES" },
        ],
        "3",
      );
      const sourcePath = join(
        baselineCopy.outputDirectory,
        "condition-3.raw.json",
      );
      const sourceContent = await readFile(sourcePath, "utf8");
      const sourceHash = createHash("sha256")
        .update(sourceContent)
        .digest("hex");
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const continued = await runBaseline(
        baselineCopy,
        [{ text: " tail" }],
        "3",
        "--continue-final",
      );

      expect(await readFile(sourcePath, "utf8")).toBe(sourceContent);
      expect(continued.checkpoint.recovery).toMatchObject({
        mode: "continue-final",
        sourceSha256: sourceHash,
        seams: [expect.objectContaining({ kind: "final-continuation" })],
      });
      const finalMessage = continued.checkpoint.interviewerMessages.at(-1);
      expect(finalMessage).toMatchObject({
        role: "assistant",
        content: "part-1",
        truncated: true,
      });
      expect(finalMessage?.continuations).toContainEqual(
        expect.objectContaining({ content: "part-2", truncated: true }),
      );
      expect(finalMessage?.continuations).toContainEqual(
        expect.objectContaining({ content: "part-5", truncated: true }),
      );
      expect(finalMessage?.continuations).toContainEqual(
        expect.objectContaining({ content: " tail", truncated: false }),
      );
      expect(continued.checkpoint.stopReason).toBe("delivered");
    });

    test("refuses final continuation for a truncated non-delivery checkpoint", async () => {
      const baselineCopy = await createBaselineCopy();
      const replies: StubReply[] = [];
      for (let turn = 1; turn <= 5; turn++) {
        replies.push(
          { text: `Prompt ${turn}.` },
          { text: "NO" },
          { text: "I have nothing to add." },
          { text: JSON.stringify(condition3NoProgressProjection()) },
        );
      }
      replies.push(
        { text: "partial-1", truncated: true },
        { text: "partial-2", truncated: true },
        { text: "partial-3", truncated: true },
        { text: "partial-4", truncated: true },
        { text: "partial-5", truncated: true },
        { text: "NO" },
      );
      const stopped = await runBaseline(baselineCopy, replies, "3");
      expect(stopped.checkpoint.stopReason).toBe(
        "no-progress-hard-stop-undelivered-incomplete",
      );
      await rm(join(baselineCopy.testDirectory, "requests.jsonl"));

      const refused = await runBaselineFailure(
        baselineCopy,
        [],
        "--continue-final",
      );

      expect(refused.stderr).toContain("nothing to continue");
      expect(refused.requests).toEqual([]);
    });
  },
);
