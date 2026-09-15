import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, test, vi } from "vitest";

import { flueConversationIdFrom } from "../../conversation/identity.ts";
import { createStepARequestAccounting } from "../../provider-accounting.ts";
import {
  documentIdFromInitialData,
  paneIdFrom,
  personaArguments,
  personaEnvironment,
  readPersonaCase,
  responds,
} from "./launch.ts";
import { readPersonaResume } from "./launch/resume.ts";

test("locates the bound Petrinaut document in supported persona modes", () => {
  expect(
    documentIdFromInitialData({
      mode: "batched-construction",
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
        : {}),
    };
    try {
      await Promise.all([
        mkdir(config.browserProfile),
        mkdir(join(run, "pi/sessions"), { recursive: true }),
      ]);
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
              mode: "batched-construction",
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
        writeFile(
          join(run, "pi/sessions/original.jsonl"),
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  name: "brunch_turn",
                  arguments: { message: "Please continue." },
                },
              ],
            },
          }),
        ),
      ]);
      const resumed = await readPersonaResume(run);
      expect(resumed.lastUtterance).toBe("Please continue.");
      expect(resumed.piSession).toBe(join(run, "pi/sessions/original.jsonl"));
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
        ["brunch:persona", "--case", relative(repo, directory)],
        {
          cwd: repo,
          env: { ...process.env, HERDR_ENV: "0" },
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Run brunch:persona from a Herdr terminal",
      ) as unknown,
    });
  } finally {
    await rm(directory, { recursive: true });
  }
}, 15_000);

test("launches a fresh restricted persona using input files, not prior session or private content arguments", () => {
  const args = personaArguments(
    "/tmp/TEST-persona",
    "claude-sonnet-4-6",
    "/tmp/TEST-socket",
  );
  expect(args).toContain("anthropic/claude-sonnet-4-6");
  expect(args).toContain("brunch_turn");
  expect(args).toContain("--no-context-files");
  expect(args).toContain("--no-builtin-tools");
  expect(args).toContain("--no-extensions");
  expect(args).toContain("--no-skills");
  expect(args).toContain("--no-prompt-templates");
  expect(args).toContain("--approve");
  expect(args).not.toContain("--no-approve");
  expect(args).toContain("--brunch-browser-bridge");
  expect(args).toContain("/tmp/TEST-socket");
  expect(args.at(-1)).toBe("@/tmp/TEST-persona/persona-input.md");
  expect(args).not.toContain("--session");
  expect(args).not.toContain("--continue");
  expect(args).not.toContain("--api-key");
});

test("resumes an exact Pi session without replaying the opening input", () => {
  const args = personaArguments(
    "/tmp/TEST-persona",
    "claude-sonnet-4-6",
    "/tmp/TEST-new-socket",
    "/tmp/TEST-persona/pi/sessions/original.jsonl",
  );
  expect(
    args.slice(args.indexOf("--session"), args.indexOf("--session") + 2),
  ).toEqual(["--session", "/tmp/TEST-persona/pi/sessions/original.jsonl"]);
  expect(args.at(-1)).toBe("@/tmp/TEST-persona/resume-input.md");
  expect(args).not.toContain("@/tmp/TEST-persona/persona-input.md");
  expect(args).not.toContain("--continue");
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

test("reads the pane id from herdr's split result", () => {
  expect(
    paneIdFrom(
      '{"id":"cli:pane:split","result":{"pane":{"pane_id":"w0:p23"}},"type":"pane_split"}',
    ),
  ).toBe("w0:p23");
});
