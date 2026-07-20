#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const image = "petrinaut-opt:local";
const container = `petrinaut-opt-website-dev-${process.pid}`;
// This launcher binds the development container to loopback only, so local
// plaintext HTTP is intentional and is never used by a deployed application.
// nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
const optimizerOrigin = "http://127.0.0.1:4004";

const wait = (durationMs) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ code, signal });
      } else {
        reject(
          new Error(
            `${command} exited ${signal ? `with ${signal}` : `with code ${code}`}`,
          ),
        );
      }
    });
  });

const waitForOptimizer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${optimizerOrigin}/status`);
      if (response.ok) {
        return;
      }
    } catch {
      // The container is still starting.
    }
    await wait(500);
  }
  throw new Error("Petrinaut Opt did not become healthy within 30 seconds");
};

let containerStarted = false;
let websiteProcess;

const stopContainer = async () => {
  if (!containerStarted) {
    return;
  }
  containerStarted = false;
  await run("docker", ["stop", "--timeout", "5", container], {
    stdio: "ignore",
  }).catch(() => undefined);
};

try {
  await run("docker", ["info"], { stdio: "ignore" }).catch(() => {
    throw new Error(
      "Docker is not running. Start Docker Desktop and run the command again.",
    );
  });

  console.log("Building Petrinaut Opt...");
  await run("docker", [
    "build",
    "--file",
    "apps/petrinaut-opt/docker/Dockerfile",
    "--tag",
    image,
    ".",
  ]);

  console.log("Starting Petrinaut Opt on http://127.0.0.1:4004...");
  await run("docker", [
    "run",
    "--detach",
    "--init",
    "--read-only",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1:4004:4004",
    image,
  ]);
  containerStarted = true;
  await waitForOptimizer();

  console.log("Building Petrinaut for the demo website...");
  await run("turbo", ["build", "--filter", "@hashintel/petrinaut"]);

  console.log("Starting the Petrinaut optimization demo...");
  websiteProcess = spawn("yarn", ["vite"], {
    cwd: appDirectory,
    env: {
      ...process.env,
      PETRINAUT_OPT_ORIGIN: optimizerOrigin,
      VITE_PETRINAUT_OPT_PROVIDER: "service",
    },
    stdio: "inherit",
  });

  const forwardSignal = (signal) => websiteProcess?.kill(signal);
  const handleSigint = () => forwardSignal("SIGINT");
  const handleSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  const result = await new Promise((resolve, reject) => {
    websiteProcess.once("error", reject);
    websiteProcess.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.off("SIGINT", handleSigint);
  process.off("SIGTERM", handleSigterm);

  if (result.signal) {
    process.exitCode = result.signal === "SIGINT" ? 130 : 143;
  } else {
    process.exitCode = result.code ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopContainer();
}
