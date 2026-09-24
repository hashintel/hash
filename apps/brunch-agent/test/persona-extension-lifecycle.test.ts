import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { openPersonaBrowserBridge } from "../src/evaluations/persona/browser-bridge";

// Opt into the installed Pi CLI; no prompt, credential, or provider request is used.
const cli = process.env.PI_PERSONA_CLI;
test.skipIf(!cli || process.platform !== "darwin")(
  "real restricted Pi hydrates the launcher socket and invalidates its tool at shutdown",
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "brunch-persona-lifecycle-"),
    );
    const messages: string[] = [];
    const bridge = await openPersonaBrowserBridge(async (message) => {
      messages.push(message);
      return {
        conversationId: "TEST-browser",
        text: "Synthetic reply",
        submissionIds: ["TEST-user", "TEST-browser-tool"],
      };
    });
    try {
      const report = join(directory, "report.json");
      const wrapper = join(directory, "extension.ts");
      await writeFile(
        wrapper,
        `
import entry from ${JSON.stringify(resolve(".pi/extensions/brunch-persona-testing.ts"))};
import { writeFileSync } from 'node:fs';
export default async (pi) => {
  const stops = [], tools = [];
  pi.on('before_provider_request', () => { throw new Error('NO_PROVIDER_CALLS'); });
  await entry({ ...pi,
    registerTool(tool) { tools.push(tool); pi.registerTool(tool); },
    on(event, handler) { if (event === 'session_shutdown') stops.push(handler); pi.on(event, handler); }
  });
  const factory = { flag: pi.getFlag('brunch-browser-bridge') ?? null, tools: tools.length };
  pi.on('session_start', async (event, ctx) => {
    const result = { factory, active: pi.getActiveTools(), reply: null, errors: [] };
    try {
      result.reply = await tools[0].execute('TEST', { message: 'Synthetic utterance' });
      for (const handler of stops) await handler(event, ctx);
      await tools[0].execute('STALE', { message: 'Must never reach browser' });
      result.errors.push('UNEXPECTED_SUCCESS');
    } catch (error) { result.errors.push(String(error)); }
    writeFileSync(${JSON.stringify(report)}, JSON.stringify(result));
  });
};`,
      );
      const socketPath = await realpath(bridge.socketPath);
      const output = await new Promise<{ code: number | null; stderr: string }>(
        (resolveChild, reject) => {
          const child = spawn(
            "/usr/bin/sandbox-exec",
            [
              "-p",
              `(version 1)(allow default)(deny network*)(allow network-outbound (literal ${JSON.stringify(socketPath)}))`,
              cli!,
              "--mode",
              "rpc",
              "--no-session",
              "--no-extensions",
              "--no-skills",
              "--no-prompt-templates",
              "--no-context-files",
              "--no-builtin-tools",
              "--tools",
              "brunch_turn",
              "--extension",
              wrapper,
              "--append-system-prompt",
              resolve(".pi/extensions/brunch-persona-testing/SYSTEM.md"),
              "--append-system-prompt",
              resolve(
                ".pi/extensions/brunch-persona-testing/axes/verbosity-terse.md",
              ),
              "--append-system-prompt",
              resolve(
                ".pi/extensions/brunch-persona-testing/axes/disclosure-forthcoming.md",
              ),
              "--brunch-browser-bridge",
              bridge.socketPath,
              "--approve",
            ],
            {
              cwd: directory,
              env: {
                PATH: process.env.PATH,
                HOME: join(directory, "home"),
                PI_CODING_AGENT_DIR: join(directory, "pi"),
                PI_OFFLINE: "1",
                PI_TELEMETRY: "0",
              },
              stdio: ["pipe", "ignore", "pipe"],
              timeout: 20_000,
            },
          );
          let stderr = "";
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
          });
          child.once("error", reject);
          child.once("close", (code) => resolveChild({ code, stderr }));
          child.stdin.end();
        },
      );
      expect(output.code, output.stderr).toBe(0);
      const result: unknown = JSON.parse(await readFile(report, "utf8"));
      expect(result).toMatchObject({
        factory: { flag: null, tools: 0 },
        active: ["brunch_turn"],
        reply: {
          content: [{ type: "text", text: "Synthetic reply" }],
          details: {
            conversationId: "TEST-browser",
            submissionIds: ["TEST-user", "TEST-browser-tool"],
          },
        },
        errors: [expect.stringContaining("session is not initialized")],
      });
      expect(messages).toEqual(["Synthetic utterance"]);
    } finally {
      await bridge.close();
      await rm(directory, { recursive: true });
    }
  },
  30_000,
);
