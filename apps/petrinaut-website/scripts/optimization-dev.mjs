#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const image = "petrinaut-opt:local";
// One fixed name rather than a per-invocation one: the container owns port
// 4004 exclusively anyway, and a fixed name lets a new launcher find and
// replace what an earlier run left behind.
const container = "petrinaut-opt-website-dev";
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

const capture = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });

/**
 * Remove containers this launcher started and never stopped. A hard-killed
 * launcher (closed terminal, crash) never reaches its cleanup, and the
 * detached container then holds port 4004 forever — every later launch would
 * fail with "port is already allocated". Removing rather than reusing them
 * also keeps the image rebuild meaningful: a leftover keeps serving the code
 * it was built from.
 */
const removeLeftoverContainers = async () => {
  // Anchored, because Docker's name filter matches substrings; the optional
  // numeric suffix catches containers older launchers named by process id.
  // Only stopped containers are swept, so a launcher already serving on the
  // port keeps its container and is reused below.
  const names = await capture("docker", [
    "ps",
    "--all",
    "--filter",
    `name=^${container}(-[0-9]+)?$`,
    "--filter",
    "status=exited",
    "--filter",
    "status=created",
    "--format",
    "{{.Names}}",
  ]).catch(() => "");
  for (const name of names.split("\n").filter(Boolean)) {
    console.log(`Removing leftover Petrinaut Opt dev container ${name}...`);
    await run("docker", ["rm", "--force", name], { stdio: "ignore" }).catch(
      () => undefined,
    );
  }
};

const isOptimizerHealthy = async () => {
  try {
    const response = await fetch(`${optimizerOrigin}/status`);
    return response.ok;
  } catch {
    return false;
  }
};

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

/** The container this launcher started, by id, so it never stops another launcher's. */
let startedContainerId = null;
let websiteProcess;

const stopContainer = async () => {
  if (startedContainerId === null) {
    return;
  }
  const containerId = startedContainerId;
  startedContainerId = null;
  await run("docker", ["stop", "--timeout", "5", containerId], {
    stdio: "ignore",
  }).catch(() => undefined);
};

try {
  await removeLeftoverContainers();

  // An optimizer this launcher does not own already serving on the port —
  // the compose stack's container, or a bare `uvicorn` during Python work —
  // is reused as-is; starting a second container would fail on the port bind.
  // Launcher-owned leftovers never reach this check: they were removed above,
  // so the freshly built image is what actually serves.
  if (await isOptimizerHealthy()) {
    console.log(`Reusing the optimizer already serving on ${optimizerOrigin}.`);
  } else {
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
    startedContainerId = (
      await capture("docker", [
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
      ])
    ).trim();
    await waitForOptimizer();
  }

  console.log("Building Petrinaut for the demo website...");
  await run("turbo", ["build", "--filter", "@hashintel/petrinaut"]);

  console.log("Starting the Petrinaut optimization demo...");
  // Extra arguments go to Vite, so a caller can pin the port:
  // `yarn dev:petrinaut-optimization --port 5175 --strictPort`.
  websiteProcess = spawn("yarn", ["vite", ...process.argv.slice(2)], {
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
