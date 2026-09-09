// TEST ONLY preload, running inside the credential-free loopback owner root.
// Fault only public BrowserServer methods; never modify installed library files.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { chromium } from "@playwright/test";

import { privateJson } from "../src/evaluations/real-provider-a5/browser-session.ts";

const path = process.argv[2];
if (!path) throw new Error("TEST session argument required");
const directory = dirname(path);
const { control } = JSON.parse(
  readFileSync(join(directory, "TEST-shutdown-fault.json"), "utf8"),
) as { control: string };
const originalLaunch = chromium.launchServer.bind(chromium);
chromium.launchServer = async (options) => {
  const server = await originalLaunch(options);
  const originalClose = server.close.bind(server);
  const originalKill = server.kill.bind(server);
  server.close = () => {
    privateJson(join(directory, "TEST-close-called.json"), {
      called: true,
      atMs: performance.now(),
    });
    if (control === "close-timeout") return new Promise<void>(() => {});
    return Promise.reject(new Error("TEST injected public close rejection"));
  };
  server.kill = () => {
    privateJson(join(directory, "TEST-kill-called.json"), {
      called: true,
      atMs: performance.now(),
    });
    if (control === "kill-rejection")
      return Promise.reject(new Error("TEST injected public kill rejection"));
    if (control === "kill-timeout") return new Promise<void>(() => {});
    return originalKill();
  };
  process.once("SIGUSR2", () => {
    // Rescue is invoked only after the production observation has been saved.
    // Saved unmodified methods never increment the production kill marker.
    privateJson(join(directory, "TEST-rescue-called.json"), { called: true });
    void originalClose()
      .catch(() => originalKill())
      .then(
        () => process.exit(0),
        () => process.exit(2),
      );
  });
  return server;
};
// Restore the launcher's three-key environment after this TEST preload imports
// library-local flags, before the unchanged production owner checks inheritance.
for (const key of Object.keys(process.env))
  if (!["PATH", "HOME", "TMPDIR", "__CF_USER_TEXT_ENCODING"].includes(key))
    delete process.env[key];
