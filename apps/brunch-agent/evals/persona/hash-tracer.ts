/**
 * Throwaway tracer (FE-2281): one persona turn against Brunch in the HASH
 * process editor, with no persona agent. Deleted once the harness owns it.
 * Usage: node --experimental-strip-types apps/brunch-agent/evals/persona/hash-tracer.ts <run-dir> "<message>"
 * Cost: one Brunch turn on the configured model.
 */
/* eslint-disable no-console, no-await-in-loop */
import { spawn } from "node:child_process";
import { mkdir, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { brunchEnv } from "../../src/env.ts";
import { submitPersonaBrowserTurn } from "./browser-turn.ts";
import {
  checkHashStack,
  createHashProcess,
  hashBrunchEnvironment,
  hashOrigins,
  openHashProcess,
  signInToHash,
} from "./hosts/hash.ts";
import { personaEnvironment } from "./launch.ts";
import { resolvePersonaRoleSettings } from "./launch/role-settings.ts";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const [
  runArgument,
  message = "We run a small bakery and keep running out of flour on Fridays.",
] = process.argv.slice(2);
if (!runArgument) throw new Error("Usage: hash-tracer.ts <run-dir> [message]");
const run = resolve(runArgument);
await mkdir(run, { recursive: true });

const signal = new AbortController().signal;
await checkHashStack(signal);

const env = hashBrunchEnvironment(
  personaEnvironment(
    resolvePersonaRoleSettings({ brunchModel: process.env.TRACER_MODEL }),
  ),
);
env[brunchEnv.devDbPath] = join(run, "conversation.db");
env[brunchEnv.dbKind] = "sqlite";
delete env[brunchEnv.chatDbPath];

const log = await open(join(run, "brunch-server.log"), "a");
const server = spawn("yarn", ["dev:brunch:server"], {
  cwd: repoRoot,
  env,
  detached: true,
  stdio: ["ignore", log.fd, log.fd],
});
const stopServer = () => {
  if (server.pid !== undefined) process.kill(-server.pid, "SIGTERM");
};
try {
  while (
    !(await fetch(`${hashOrigins.brunch}/health`).then(
      (response) => response.ok,
      () => false,
    ))
  ) {
    if (server.exitCode !== null) throw new Error("Brunch exited; see log");
    await delay(200);
  }
  console.log("Brunch up");

  const browser = await chromium.launchPersistentContext(
    join(tmpdir(), `hash-tracer-${Date.now()}`),
    {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: false,
      viewport: null,
    },
  );
  try {
    const page = browser.pages()[0] ?? (await browser.newPage());
    const seen: unknown[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(hashOrigins.brunch))
        void request.allHeaders().then((headers) =>
          seen.push({
            method: request.method(),
            url: request.url(),
            headers: Object.fromEntries(
              Object.entries(headers).map(([key, value]) => [
                key,
                key === "cookie" ? `${value.slice(0, 40)}…` : value,
              ]),
            ),
          }),
        );
    });
    await signInToHash(page);
    console.log("Signed in");
    const entityUuid = await createHashProcess(page, {
      title: "Persona tracer",
      definition: {
        places: [],
        transitions: [],
        types: [],
        parameters: [],
        differentialEquations: [],
      },
    });
    console.log(`Process ${entityUuid}`);
    await openHashProcess(page, entityUuid).catch(async (error: unknown) => {
      await page.screenshot({ path: join(run, "open-failed.png") });
      await writeFile(
        join(run, "open-failed.yaml"),
        await page.locator("body").ariaSnapshot(),
      );
      await writeFile(
        join(run, "requests.json"),
        JSON.stringify(seen, null, 2),
      );
      throw error;
    });
    console.log("Assistant shown");
    try {
      const result = await submitPersonaBrowserTurn(page, message);
      console.log(`Reply:\n${result.reply.text}`);
      await writeFile(
        join(run, "snapshot.json"),
        JSON.stringify(result.snapshot, null, 2),
      );
    } finally {
      await writeFile(
        join(run, "requests.json"),
        JSON.stringify(seen, null, 2),
      );
    }
  } finally {
    await browser.close();
  }
} finally {
  stopServer();
  await log.close();
}
