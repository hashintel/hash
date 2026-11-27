import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { FlueExecutionError } from "@flue/sdk";
import { afterEach, expect, test, vi } from "vitest";

import { createStepARequestAccounting } from "../../src/server/provider-accounting.ts";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_THINKING,
} from "../../src/shared/chat-model.ts";
import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import {
  personaEnvironment,
  personaSettingsRecord,
  readPersonaCase,
  recordingReadySummary,
  responds,
  settlePersonaLauncherStop,
} from "./launch.ts";
import { appendAdmittedUtterance } from "./launch/bridge-log.ts";
import { resolvePersonaDriver } from "./launch/driver.ts";
import { readPersonaResume } from "./launch/resume.ts";
import {
  resolvePersonaRoleSettings,
  roleSettingsFromRun,
} from "./launch/role-settings.ts";

import type { AgentSendResult, FlueClient } from "@flue/sdk";

test("launcher Stop observes durable aborted settlement before cleanup", async () => {
  const receipt = {
    submissionId: "sub_TEST",
  } as AgentSendResult;
  let abortRecorded = false;
  const client = {
    abort: vi.fn<FlueClient["abort"]>(async () => {
      abortRecorded = true;
      return { aborted: true };
    }),
    wait: vi.fn<FlueClient["wait"]>(async () => {
      expect(abortRecorded).toBe(true);
      throw new FlueExecutionError({
        target: "agent_submission",
        targetId: receipt.submissionId,
        failure: "aborted",
      });
    }),
  };

  await expect(
    settlePersonaLauncherStop(client, receipt, 100),
  ).resolves.toEqual({
    settlement: "aborted",
    submissionId: receipt.submissionId,
  });
});

test("launcher Stop bounds an unobserved settlement", async () => {
  const receipt = {
    submissionId: "sub_TEST_timeout",
  } as AgentSendResult;
  const client = {
    abort: vi.fn<FlueClient["abort"]>().mockResolvedValue({ aborted: true }),
    wait: vi.fn<FlueClient["wait"]>(
      (_receipt, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    ),
  };

  await expect(settlePersonaLauncherStop(client, receipt, 5)).resolves.toEqual({
    settlement: "not-observed",
    submissionId: receipt.submissionId,
  });
});

const loadingRuntimeUnavailable = {
  error: { type: "runtime_unavailable", meta: { state: "loading" } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("both launcher children override inherited campaign accounting", () => {
  vi.stubEnv("DEBUG", "");
  vi.stubEnv("BRUNCH_STEP_A_ACCOUNTING", "invalid inherited campaign");
  const environment = personaEnvironment();
  expect(environment.BRUNCH_STEP_A_ACCOUNTING).toBe("");
  expect(environment.BRUNCH_CHAT_MODEL).toBe(DEFAULT_CHAT_MODEL);
  expect(environment.BRUNCH_CHAT_THINKING).toBe(DEFAULT_CHAT_THINKING);
  expect(
    createStepARequestAccounting(environment.BRUNCH_STEP_A_ACCOUNTING),
  ).toBeUndefined();
});

test.each([false, true])(
  "resume reads original stores without consulting accounting (legacy: %s)",
  async (legacy) => {
    const run = await mkdtemp(join(tmpdir(), "TEST-persona-resume-"));
    const identity = {
      actorKey: "TEST-owner",
      conversationId: "TEST-conversation",
    };
    const config = {
      caseDirectory: "/TEST/case",
      model: "claude-sonnet-4-6",
      databasePath: join(run, "conversation.db"),
      browserProfile: join(run, "chrome"),
      panelOrigin: "http://127.0.0.1:4926",
      route: "/",
      ...(legacy
        ? {
            budgetUsd: 0,
            accounting: {
              ledgerPath: join(run, "usage-ledger.json"),
              runId: "TEST-old",
            },
          }
        : {}),
    };
    try {
      await mkdir(config.browserProfile);
      await appendAdmittedUtterance(run, {
        source: "opening",
        message: "Hello.",
        submissionId: "sub_TEST_opening",
        personaDriver: { kind: "agent", agent: "pi" },
      });
      await appendAdmittedUtterance(run, {
        source: "persona",
        message: "Please continue.",
        submissionId: "sub_TEST",
        personaDriver: { kind: "agent", agent: "pi" },
      });
      await Promise.all([
        writeFile(join(run, "run.json"), JSON.stringify(config)),
        writeFile(config.databasePath, "TEST store presence"),
        writeFile(
          join(run, "usage-ledger.json"),
          "TEST unknown historical usage; not a valid ledger",
        ),
        writeFile(
          join(run, "session.json"),
          JSON.stringify({
            // A run directory keeps the actor key under its pre-rename name.
            ownerKey: identity.actorKey,
            conversationId: identity.conversationId,
            uid: "TEST-uid",
            url: `${config.panelOrigin}/agents/petrinaut/${flueConversationId(identity)}`,
            initialData: {
              binding: {
                conversationId: identity.conversationId,
                documentId: "TEST-document",
              },
            },
          }),
        ),
      ]);
      const resumed = await readPersonaResume(run);
      expect(resumed.session.actorKey).toBe(identity.actorKey);
      expect(resumed.lastUtterance).toBe("Please continue.");
      expect(resumed.config.brunchModel).toBe("anthropic/claude-sonnet-4-6");
      expect(resumed.config.brunchThinking).toBe("medium");
      expect(await readFile(join(run, "usage-ledger.json"), "utf8")).toBe(
        "TEST unknown historical usage; not a valid ledger",
      );
    } finally {
      await rm(run, { recursive: true });
    }
  },
);

test("reads a generic case and sends the trimmed opening file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brunch-launch-test-"));
  try {
    await Promise.all([
      writeFile(join(directory, "situation-pack.md"), "PRIVATE background"),
      writeFile(
        join(directory, "opening-message.md"),
        "\nHello, I could use some help.\n",
      ),
    ]);
    expect(await readPersonaCase(directory)).toEqual({
      pack: "PRIVATE background",
      opening: "Hello, I could use some help.",
    });
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("root launch command resolves a caller-relative case before checking interactive prerequisites", async () => {
  const repo = fileURLToPath(new URL("../../../../", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "TEST-persona case-"));
  try {
    await Promise.all([
      writeFile(join(directory, "situation-pack.md"), "Private context"),
      writeFile(join(directory, "opening-message.md"), "Public opening"),
    ]);
    await expect(
      promisify(execFile)(
        "yarn",
        [
          "brunch:persona",
          "--case",
          relative(repo, directory),
          "--agent",
          "claude",
        ],
        {
          cwd: repo,
          env: { ...process.env, HERDR_ENV: "0" },
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Without Herdr the persona agent needs an interactive terminal",
      ) as unknown,
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}, 15_000);

test("resume requires the bridge log that Pi-era runs lack", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-legacy-"));
  const identity = {
    actorKey: "TEST-owner",
    conversationId: "TEST-conversation",
  };
  const panelOrigin = "http://127.0.0.1:4926";
  try {
    await mkdir(join(run, "chrome"));
    await Promise.all([
      writeFile(
        join(run, "run.json"),
        JSON.stringify({
          caseDirectory: "/TEST/case",
          brunchModel: "openai/gpt-5.6-sol",
          brunchThinking: "low",
          databasePath: join(run, "conversation.db"),
          browserProfile: join(run, "chrome"),
          panelOrigin,
          route: "/",
        }),
      ),
      writeFile(join(run, "conversation.db"), "TEST store presence"),
      writeFile(
        join(run, "session.json"),
        JSON.stringify({
          ownerKey: identity.actorKey,
          conversationId: identity.conversationId,
          uid: "TEST-uid",
          url: `${panelOrigin}/agents/petrinaut/${flueConversationId(identity)}`,
          initialData: {
            binding: {
              conversationId: identity.conversationId,
              documentId: "TEST-document",
            },
          },
        }),
      ),
    ]);
    await expect(readPersonaResume(run)).rejects.toThrow(
      /bridge-log\.jsonl; runs from the Pi extension launcher cannot be resumed/,
    );
  } finally {
    await rm(run, { recursive: true });
  }
});

test("treats only Flue's loading runtime-unavailable response as not ready while polling an owned service", async () => {
  const fetch = vi.fn<() => Promise<Response>>().mockResolvedValue(
    new Response(JSON.stringify(loadingRuntimeUnavailable), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal, {
      allowLoading: true,
    }),
  ).resolves.toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
});

test("refuses a loading response from a pre-existing service", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify(loadingRuntimeUnavailable), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal),
  ).rejects.toThrow("returned 503");
});

test.each([
  {
    body: { error: { type: "runtime_unavailable", meta: { state: "failed" } } },
    status: 503,
  },
  { body: { error: { type: "runtime_unavailable" } }, status: 503 },
  { body: { error: { type: "other" } }, status: 503 },
  { body: {}, status: 500 },
])("refuses unhealthy startup response %#", async ({ body, status }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  await expect(
    responds("http://127.0.0.1:4321/health", new AbortController().signal, {
      allowLoading: true,
    }),
  ).rejects.toThrow(`returned ${status}`);
});

test("Brunch defaults to the Petrinaut assistant model", () => {
  expect(resolvePersonaRoleSettings()).toEqual({
    brunchModel: DEFAULT_CHAT_MODEL,
    brunchThinking: DEFAULT_CHAT_THINKING,
  });
});

test("rejects an unsupported Sol thinking level", () => {
  expect(() =>
    resolvePersonaRoleSettings({ brunchThinking: "minimal" }),
  ).toThrow(/Unsupported thinking minimal/);
});

test("retains Brunch role settings from run metadata and ignores Pi-era persona fields", () => {
  expect(
    roleSettingsFromRun({
      brunchModel: "openai/gpt-5.6-sol",
      brunchThinking: "low",
      personaModel: "anthropic/claude-sonnet-4-6",
      personaThinking: "medium",
    }),
  ).toEqual({
    brunchModel: "openai/gpt-5.6-sol",
    brunchThinking: "low",
  });
});

test("fresh run metadata retains effective role and driver settings", () => {
  expect(
    personaSettingsRecord(
      resolvePersonaRoleSettings(),
      resolvePersonaDriver({
        agent: "pi",
        personaModel: "anthropic/claude-sonnet-4-6",
        personaThinking: "medium",
      }),
    ),
  ).toEqual({
    brunchModel: DEFAULT_CHAT_MODEL,
    brunchThinking: DEFAULT_CHAT_THINKING,
    personaDriver: {
      kind: "agent",
      agent: "pi",
      personaModel: "anthropic/claude-sonnet-4-6",
      personaThinking: "medium",
    },
  });
  expect(
    personaSettingsRecord(resolvePersonaRoleSettings(), {
      kind: "scripted",
      scriptPath: "/tmp/demo/smoke.json",
      scriptSha256: "abcdef0123456789",
    }),
  ).toEqual({
    brunchModel: DEFAULT_CHAT_MODEL,
    brunchThinking: DEFAULT_CHAT_THINKING,
    personaDriver: {
      kind: "scripted",
      scriptPath: "/tmp/demo/smoke.json",
      scriptSha256: "abcdef0123456789",
    },
  });
});

test("recording-ready summary reports the persona driver", () => {
  const summary = recordingReadySummary({
    title: "TEST window",
    url: "http://127.0.0.1:4915/",
    browserProfile: "/tmp/TEST-profile",
    roles: resolvePersonaRoleSettings(),
    driver: resolvePersonaDriver({ agent: "claude" }),
    resume: true,
  });
  expect(summary).toContain("Persona driver: claude");
});

test("help documents the objective, agent, and script options", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("./launch.ts", import.meta.url)),
      "--help",
    ],
    { env: process.env },
  );
  expect(stdout).toContain(
    "--objective is fresh-run-only and is neither retained nor reapplied",
  );
  expect(stdout).toContain("--agent claude|codex|cursor-agent|pi");
  expect(stdout).toContain("--script <file>");
  expect(stdout).toContain("--interview-length quick|standard|thorough|deep");
  expect(stdout).toContain("{prompt}");
  expect(stdout).not.toContain("--guidance");
});

test("resume rejects a fresh-run option before reading the retained run", async () => {
  await expect(
    promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        fileURLToPath(new URL("./launch.ts", import.meta.url)),
        "--resume",
        "/path/that/does/not/exist",
        "--brunch-thinking",
        "low",
      ],
      { env: process.env },
    ),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining(
      "--resume cannot be combined with fresh-run options",
    ) as unknown,
  });
});

test("CLI rejects incompatible --script combinations before launching services", async () => {
  const directory = await mkdtemp(join(tmpdir(), "TEST-persona-script-cli-"));
  const launchFile = fileURLToPath(new URL("./launch.ts", import.meta.url));
  const openScript = join(directory, "open.json");
  const sayScript = join(directory, "say.json");
  const badScript = join(directory, "bad.json");
  await Promise.all([
    writeFile(openScript, JSON.stringify({ steps: [{ type: "open" }] })),
    writeFile(
      sayScript,
      JSON.stringify({ steps: [{ type: "say", message: "Hi." }] }),
    ),
    writeFile(badScript, JSON.stringify({ steps: [] })),
  ]);
  const runCli = (args: string[]) =>
    promisify(execFile)(
      process.execPath,
      ["--experimental-strip-types", launchFile, ...args],
      { env: process.env },
    );

  try {
    await expect(runCli(["--script", openScript])).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Persona script contains an `open` step, which requires --case",
      ) as unknown,
    });
    await expect(
      runCli(["--script", sayScript, "--objective", "Private goal"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "--script cannot be combined with --objective",
      ) as unknown,
    });
    await expect(
      runCli(["--script", sayScript, "--agent", "claude"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Use at most one of --agent, --agent-command, or --script",
      ) as unknown,
    });
    await expect(runCli(["--script", badScript])).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid persona script") as unknown,
    });
    await expect(
      runCli(["--resume", "/path/that/does/not/exist", "--script", openScript]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "A --script passed with --resume cannot contain an `open` step",
      ) as unknown,
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}, 20_000);

test("resume parses a case-less scripted run and refuses replaying it without a replacement driver", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-script-resume-"));
  const identity = {
    actorKey: "TEST-owner",
    conversationId: "TEST-conversation",
  };
  const panelOrigin = "http://127.0.0.1:4926";
  const scriptedDriver = {
    kind: "scripted" as const,
    scriptPath: "/tmp/demo/steps.json",
    scriptSha256: "abcdef0123456789",
  };
  try {
    await mkdir(join(run, "chrome"));
    await appendAdmittedUtterance(run, {
      source: "persona",
      message: "First scripted message.",
      submissionId: "sub_TEST",
      personaDriver: scriptedDriver,
    });
    await Promise.all([
      writeFile(
        join(run, "run.json"),
        JSON.stringify({
          host: "website",
          brunchModel: "openai/gpt-6.1-sol",
          brunchThinking: "medium",
          personaDriver: scriptedDriver,
          databasePath: join(run, "conversation.db"),
          browserProfile: join(run, "chrome"),
          panelOrigin,
          route: "/",
        }),
      ),
      writeFile(join(run, "conversation.db"), "TEST store presence"),
      writeFile(
        join(run, "session.json"),
        JSON.stringify({
          ownerKey: identity.actorKey,
          conversationId: identity.conversationId,
          uid: "TEST-uid",
          url: `${panelOrigin}/agents/petrinaut/${flueConversationId(identity)}`,
          initialData: {
            binding: {
              conversationId: identity.conversationId,
              documentId: "TEST-document",
            },
          },
        }),
      ),
    ]);
    const resumed = await readPersonaResume(run);
    expect(resumed.config.caseDirectory).toBeUndefined();
    expect(resumed.lastUtterance).toBe("First scripted message.");

    const launchFile = fileURLToPath(new URL("./launch.ts", import.meta.url));
    await expect(
      promisify(execFile)(
        process.execPath,
        ["--experimental-strip-types", launchFile, "--resume", run],
        { env: process.env },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Cannot automatically resume a scripted run without a driver option",
      ) as unknown,
    });
  } finally {
    await rm(run, { recursive: true });
  }
}, 15_000);
