import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { conversationConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn";
import { CONSTRUCTION_BINDING_SIGNAL_TYPE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import { flueConversationIdFrom } from "../src/conversation/identity";

// Explicit installed CLI opt-in: this crosses Pi's real flag hydration and
// dynamic registration boundary, without a model or provider invocation.
const cli = process.env.PI_PERSONA_CLI;
test.skipIf(!cli || process.platform !== "darwin")(
  "real restricted CLI attaches after flag hydration and fails closed across lifecycle errors",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "brunch-persona-lifecycle-"));
    const identity = {
      principalKey: "TEST-owner",
      conversationId: "TEST-browser",
    };
    const binding = {
      conversationId: identity.conversationId,
      documentId: "TEST-document",
      incarnationId: "TEST-incarnation",
    };
    const requests: {
      method: string | undefined;
      url: string | undefined;
      body: string;
    }[] = [];
    let canonicalBindingMatches = true;
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        requests.push({ method: request.method, url: request.url, body });
        response.setHeader("content-type", "application/json");
        if (request.method === "POST") {
          // Stop at the native conditional admission: no elicitor is running.
          response
            .writeHead(409)
            .end(JSON.stringify({ error: "SYNTHETIC_ADMISSION_STOP" }));
        } else {
          response.end(
            JSON.stringify({
              v: 1,
              conversationId: "TEST-runtime",
              offset: "opaque",
              settlements: [],
              messages: [
                {
                  id: "binding",
                  role: "system",
                  purpose: "dispatch",
                  display: "hidden",
                  signal: { tagName: CONSTRUCTION_BINDING_SIGNAL_TYPE },
                  parts: [
                    {
                      type: "text",
                      state: "done",
                      text: JSON.stringify({
                        binding: canonicalBindingMatches
                          ? binding
                          : { ...binding, incarnationId: "foreign" },
                      }),
                    },
                  ],
                },
              ],
            }),
          );
        }
      });
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    const route = `/agents/chat/${flueConversationIdFrom(identity)}`;
    const config = {
      ...identity,
      url: `http://127.0.0.1:${address.port}${route}`,
      uid: "TEST-original-uid",
      initialData: {
        mode: conversationConstructionMode,
        construction: { binding },
      },
    };
    const sessionPath = join(directory, "session.json");
    writeFileSync(sessionPath, JSON.stringify(config));
    const extension = resolve(".pi/extensions/brunch-persona-testing.ts");
    const guard = resolve(
      "../../libs/@hashintel/brunch-agent/evaluations/protocols/network-guard/loopback-only.sb",
    );
    try {
      for (const mode of [
        "valid",
        "missing",
        "malformed",
        "mismatch",
        "canonical-mismatch",
        "blank",
        "host-conflict",
      ]) {
        requests.length = 0;
        canonicalBindingMatches = mode !== "canonical-mismatch";
        const report = join(directory, `${mode}.json`);
        const wrapper = join(directory, `${mode}.ts`);
        const invalidPath = join(directory, `${mode}-binding.json`);
        if (mode === "malformed") writeFileSync(invalidPath, "{");
        if (mode === "mismatch")
          writeFileSync(
            invalidPath,
            JSON.stringify({ ...config, principalKey: "foreign" }),
          );
        const selectedPath =
          mode === "blank"
            ? " "
            : ["missing", "malformed", "mismatch"].includes(mode)
              ? invalidPath
              : sessionPath;
        writeFileSync(
          wrapper,
          `
import entry from ${JSON.stringify(extension)};
import { writeFileSync } from 'node:fs';
export default async (pi) => {
  const starts = [], stops = [], tools = [];
  pi.on('before_provider_request', () => { throw new Error('NO_PROVIDER_CALLS'); });
  await entry({ ...pi,
    registerTool(tool) { tools.push(tool); pi.registerTool(tool); },
    on(event, handler) { if (event === 'session_start') starts.push(handler); if (event === 'session_shutdown') stops.push(handler); pi.on(event, handler); }
  });
  const factory = { flag: pi.getFlag('brunch-browser-session') ?? null, tools: tools.length };
  pi.on('session_start', async (event, ctx) => {
    const result = { factory, active: pi.getActiveTools(), tools: tools.length, errors: [] };
    const invoke = async (tool) => { try { await tool.execute('TEST', { message: 'Synthetic utterance' }); result.errors.push('UNEXPECTED_SUCCESS'); } catch (error) { result.errors.push(String(error)); } };
    if (tools[0]) {
      await invoke(tools[0]);
      // Repeat initialization with a now-invalid binding. The old registered
      // closure must reject even though Pi can continue after handler errors.
      writeFileSync(${JSON.stringify(sessionPath)}, '{');
      for (const handler of starts) { try { await handler(event, ctx); } catch (error) { result.errors.push(String(error)); } }
      await invoke(tools[0]);
      for (const handler of stops) await handler(event, ctx);
      await invoke(tools[0]);
    }
    writeFileSync(${JSON.stringify(report)}, JSON.stringify(result));
  });
};`,
        );
        // The valid case deliberately corrupts its private fixture after first send.
        writeFileSync(sessionPath, JSON.stringify(config));
        // Cases share the synthetic listener and binding; keep them serial.
        // eslint-disable-next-line no-await-in-loop
        const output = await new Promise<{
          code: number | null;
          stdout: string;
          stderr: string;
        }>((resolveChild, reject) => {
          const child = spawn(
            "/usr/bin/sandbox-exec",
            [
              "-f",
              guard,
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
              "--brunch-browser-session",
              selectedPath,
              "--brunch-tool-host",
              mode === "host-conflict" ? "mock" : "none",
            ],
            {
              cwd: directory,
              env: {
                PATH: process.env.PATH,
                HOME: join(directory, `home-${mode}`),
                PI_CODING_AGENT_DIR: join(directory, `config-${mode}`),
                PI_SUBAGENT_NAME: "TEST-default-must-not-route",
                PI_SKIP_VERSION_CHECK: "1",
              },
              stdio: ["pipe", "pipe", "pipe"],
              timeout: 20_000,
            },
          );
          let stdout = "",
            stderr = "";
          child.stdout.on("data", (data) => {
            stdout += String(data);
          });
          child.stderr.on("data", (data) => {
            stderr += String(data);
          });
          child.on("error", reject);
          child.on("close", (code) => resolveChild({ code, stdout, stderr }));
          child.stdin.end();
        });
        writeFileSync(
          join(directory, `${mode}-cli.json`),
          JSON.stringify(output),
        );
        writeFileSync(
          join(directory, `${mode}-requests.json`),
          JSON.stringify(requests),
        );
        expect(output.code, output.stderr).toBe(0);
        const result = JSON.parse(readFileSync(report, "utf8")) as {
          factory: unknown;
          active: string[];
          tools: number;
          errors: string[];
        };
        expect(result.factory).toEqual({ flag: null, tools: 0 });
        // Fixed, exhaustive test cases have intentionally different oracles.
        /* eslint-disable vitest/no-conditional-expect */
        if (mode === "valid") {
          expect(result.active).toEqual(["brunch_turn"]);
          expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
            { method: "GET", url: `${route}?view=history` },
            { method: "POST", url: route },
          ]);
          expect(JSON.parse(requests[1]!.body)).toMatchObject({
            uid: config.uid,
          });
          expect(JSON.parse(requests[1]!.body)).not.toHaveProperty(
            "initialData",
          );
          expect(result.errors.slice(-2)).toEqual([
            expect.stringContaining("session is not initialized"),
            expect.stringContaining("session is not initialized"),
          ]);
        } else {
          expect(result.active).toEqual([]);
          expect(result.tools).toBe(0);
          expect(requests).toEqual(
            mode === "canonical-mismatch"
              ? [{ method: "GET", url: `${route}?view=history`, body: "" }]
              : [],
          );
        }
        /* eslint-enable vitest/no-conditional-expect */
      }
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      process.stdout.write(`Persona CLI lifecycle evidence: ${directory}\n`);
    }
  },
  120_000,
);
