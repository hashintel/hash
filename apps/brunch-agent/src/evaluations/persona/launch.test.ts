import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { FlueExecutionError } from "@flue/sdk";
import { afterEach, expect, test, vi } from "vitest";

import { DEFAULT_CHAT_MODEL, DEFAULT_CHAT_THINKING } from "../../chat-model.ts";
import { flueConversationIdFrom } from "../../conversation/identity.ts";
import { createStepARequestAccounting } from "../../provider-accounting.ts";
import {
  documentIdFromInitialData,
  personaEnvironment,
  personaSettingsRecord,
  readPersonaCase,
  recordingReadySummary,
  responds,
  settlePersonaLauncherStop,
} from "./launch.ts";
import { resolvePersonaAgentSettings } from "./launch/agent.ts";
import {
  axisSettingsFromRun,
  resolvePersonaAxisSettings,
} from "./launch/axis-settings.ts";
import { appendAdmittedUtterance } from "./launch/bridge-log.ts";
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

test("locates the bound Petrinaut document in I", () => {
  expect(
    documentIdFromInitialData({
      mode: "integrated-brunch-canonical",
      construction: {
        binding: {
          conversationId: "conversation",
          documentId: "document-construction",
          incarnationId: "incarnation",
        },
      },
    }),
  ).toBe("document-construction");
  expect(
    documentIdFromInitialData({
      browser: {
        binding: {
          conversationId: "conversation",
          documentId: "document-browser",
          incarnationId: "incarnation",
        },
      },
    }),
  ).toBe("document-browser");
  expect(documentIdFromInitialData({})).toBeUndefined();
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
      principalKey: "TEST-principal",
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
        : {
            personaVerbosity: "expansive",
            personaDisclosure: "forthcoming",
          }),
    };
    try {
      await mkdir(config.browserProfile);
      await appendAdmittedUtterance(run, "opening", "Hello.");
      await appendAdmittedUtterance(
        run,
        "persona",
        "Please continue.",
        "sub_TEST",
      );
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
            ...identity,
            uid: "TEST-uid",
            url: `${config.panelOrigin}/agents/chat/${flueConversationIdFrom(identity)}`,
            initialData: {
              mode: "integrated-brunch-canonical",
              construction: {
                binding: {
                  conversationId: identity.conversationId,
                  documentId: "TEST-document",
                  incarnationId: "TEST-incarnation",
                },
              },
            },
          }),
        ),
      ]);
      const resumed = await readPersonaResume(run);
      expect(resumed.lastUtterance).toBe("Please continue.");
      expect(resumed.config.brunchModel).toBe("anthropic/claude-sonnet-4-6");
      expect(resumed.config.brunchThinking).toBe("medium");
      expect(resumed.config.personaVerbosity).toBe(
        legacy ? "default" : "expansive",
      );
      expect(resumed.config.personaDisclosure).toBe(
        legacy ? "default" : "forthcoming",
      );
      expect(await readFile(join(run, "usage-ledger.json"), "utf8")).toBe(
        "TEST unknown historical usage; not a valid ledger",
      );
    } finally {
      await rm(run, { recursive: true });
    }
  },
);

test.each([true, false])(
  "reads a generic case and separates the public opening (header: %s)",
  async (header) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-launch-test-"));
    try {
      await Promise.all([
        writeFile(join(directory, "situation-pack.md"), "PRIVATE background"),
        writeFile(
          join(directory, "opening-message.md"),
          `${header ? "PRIVATE operator note\n\n---\n\n" : ""}Hello, please interview me.\n`,
        ),
      ]);
      expect(await readPersonaCase(directory)).toEqual({
        pack: "PRIVATE background",
        opening: "Hello, please interview me.",
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test("root launch command resolves a caller-relative case before checking interactive prerequisites", async () => {
  const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
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
    principalKey: "TEST-principal",
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
          ...identity,
          uid: "TEST-uid",
          url: `${panelOrigin}/agents/chat/${flueConversationIdFrom(identity)}`,
          initialData: {
            mode: "integrated-brunch-canonical",
            construction: {
              binding: {
                conversationId: identity.conversationId,
                documentId: "TEST-document",
                incarnationId: "TEST-incarnation",
              },
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

test("persona axes accept only their exact literals and default independently", () => {
  expect(resolvePersonaAxisSettings()).toEqual({
    personaVerbosity: "default",
    personaDisclosure: "default",
  });
  expect(
    resolvePersonaAxisSettings({
      personaVerbosity: "terse",
      personaDisclosure: "forthcoming",
    }),
  ).toEqual({
    personaVerbosity: "terse",
    personaDisclosure: "forthcoming",
  });
  expect(() =>
    resolvePersonaAxisSettings({ personaVerbosity: "brief" }),
  ).toThrow(
    "Unsupported persona verbosity brief; expected terse|default|expansive",
  );
  expect(() =>
    resolvePersonaAxisSettings({ personaDisclosure: "open" }),
  ).toThrow(
    "Unsupported persona disclosure open; expected reticent|default|forthcoming",
  );
});

test("legacy runs default missing axes while retained runs preserve effective axes", () => {
  expect(axisSettingsFromRun({})).toEqual({
    personaVerbosity: "default",
    personaDisclosure: "default",
  });
  expect(
    axisSettingsFromRun({
      personaVerbosity: "expansive",
      personaDisclosure: "reticent",
    }),
  ).toEqual({
    personaVerbosity: "expansive",
    personaDisclosure: "reticent",
  });
  expect(() => axisSettingsFromRun({ personaVerbosity: "TERSE" })).toThrow(
    /Unsupported persona verbosity TERSE/,
  );
});

test("fresh run metadata retains effective role, axis and agent settings", () => {
  expect(
    personaSettingsRecord(
      resolvePersonaRoleSettings(),
      resolvePersonaAxisSettings({
        personaVerbosity: "expansive",
        personaDisclosure: "forthcoming",
      }),
      resolvePersonaAgentSettings({
        agent: "pi",
        personaModel: "anthropic/claude-sonnet-4-6",
        personaThinking: "medium",
      }),
    ),
  ).toEqual({
    brunchModel: DEFAULT_CHAT_MODEL,
    brunchThinking: DEFAULT_CHAT_THINKING,
    personaVerbosity: "expansive",
    personaDisclosure: "forthcoming",
    personaAgent: {
      agent: "pi",
      personaModel: "anthropic/claude-sonnet-4-6",
      personaThinking: "medium",
    },
  });
});

test("recording-ready summary reports retained effective persona axes and the agent", () => {
  const summary = recordingReadySummary({
    title: "TEST window",
    url: "http://127.0.0.1:4915/",
    browserProfile: "/tmp/TEST-profile",
    roles: resolvePersonaRoleSettings(),
    axes: resolvePersonaAxisSettings({
      personaVerbosity: "terse",
      personaDisclosure: "forthcoming",
    }),
    agent: resolvePersonaAgentSettings({ agent: "claude" }),
    resume: true,
  });
  expect(summary).toContain(
    "Persona axes: verbosity terse; disclosure forthcoming",
  );
  expect(summary).toContain("Persona agent: claude");
});

test("help documents exact axis literals and retained resume behavior", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--experimental-strip-types",
      fileURLToPath(new URL("./launch.ts", import.meta.url)),
      "--help",
    ],
    { env: process.env },
  );
  expect(stdout).toContain("--persona-verbosity terse|default|expansive");
  expect(stdout).toContain("--persona-disclosure reticent|default|forthcoming");
  expect(stdout).toContain("retained effective persona axes");
  expect(stdout).toContain(
    "--objective is fresh-run-only and is neither retained nor reapplied",
  );
  expect(stdout).toContain("--agent claude|codex|cursor-agent|pi");
  expect(stdout).toContain("{prompt}");
});

test("resume rejects a fresh axis before reading the retained run", async () => {
  await expect(
    promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        fileURLToPath(new URL("./launch.ts", import.meta.url)),
        "--resume",
        "/path/that/does/not/exist",
        "--persona-verbosity",
        "terse",
      ],
      { env: process.env },
    ),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining(
      "--resume cannot be combined with fresh-run options",
    ) as unknown,
  });
});
