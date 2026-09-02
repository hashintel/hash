/**
 * The local Petrinaut Optimizer service for a dev server that wants the real
 * optimization provider: start it before the server, stop it after.
 *
 * The service runs from the `petrinaut-opt:local` Docker image, built from
 * `apps/petrinaut-opt/docker/Dockerfile`, bound to loopback on port 4004. An
 * optimizer already serving that port healthily, the compose stack's container
 * or a bare `uvicorn` during Python work, is reused and left running.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The dev-task argument that turns the service on. */
export const OPTIMIZER_SERVICE_FLAG = "--with-optimizer-service";

// Loopback only, so plaintext HTTP is intentional and never reaches a
// deployed application.
// nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
export const OPTIMIZER_SERVICE_ORIGIN = "http://127.0.0.1:4004";

const repositoryRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const image = "petrinaut-opt:local";
// One fixed name: the container owns port 4004 exclusively anyway, and a fixed
// name lets a new launcher find what an earlier run left behind.
const container = "petrinaut-opt-website-dev";

/** Splits the service flag off a dev task's arguments. */
export const splitOptimizerServiceFlag = (cliArguments) => ({
  withService: cliArguments.includes(OPTIMIZER_SERVICE_FLAG),
  forwarded: cliArguments.filter(
    (argument) => argument !== OPTIMIZER_SERVICE_FLAG,
  ),
});

/** The environment that points a dev server at the service. */
export const optimizerServiceEnvironment = (env) => ({
  ...env,
  PETRINAUT_OPT_ORIGIN: OPTIMIZER_SERVICE_ORIGIN,
  VITE_PETRINAUT_OPT_PROVIDER: "service",
});

const wait = (durationMs) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

/** Runs a command to completion, rejecting on a non-zero exit. */
export const runToCompletion = (command, args, options = {}) =>
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
 * Runs a long-lived dev server, forwarding SIGINT and SIGTERM to it, and
 * resolves with the exit code the process should report.
 */
export const runDevServer = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    const forward = (signal) => () => child.kill(signal);
    const onSigint = forward("SIGINT");
    const onSigterm = forward("SIGTERM");
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    const release = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };
    child.once("error", (error) => {
      release();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      release();
      if (signal) {
        resolve(signal === "SIGINT" ? 130 : 143);
      } else {
        resolve(code ?? 1);
      }
    });
  });

/**
 * Removes stopped containers an earlier run left behind. A hard-killed launcher
 * never reaches its cleanup, and the leftover otherwise holds port 4004 while
 * serving the code it was built from. The filter is anchored because Docker
 * matches names by substring; the optional numeric suffix catches containers
 * older launchers named by process id. Only stopped containers are swept, so a
 * launcher already serving on the port keeps its container and is reused.
 */
const removeLeftoverContainers = async () => {
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
    await runToCompletion("docker", ["rm", "--force", name], {
      stdio: "ignore",
    }).catch(() => undefined);
  }
};

const isOptimizerHealthy = async () => {
  try {
    const response = await fetch(`${OPTIMIZER_SERVICE_ORIGIN}/status`);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForOptimizer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isOptimizerHealthy()) {
      return;
    }
    await wait(500);
  }
  throw new Error("Petrinaut Opt did not become healthy within 30 seconds");
};

/**
 * Ensures an optimizer serves `OPTIMIZER_SERVICE_ORIGIN`, starting one when
 * none does. `stop()` stops only the container this call started, by id, so
 * two launchers never stop each other's.
 */
export const startOptimizerService = async () => {
  await removeLeftoverContainers();

  if (await isOptimizerHealthy()) {
    console.log(
      `Reusing the optimizer already serving on ${OPTIMIZER_SERVICE_ORIGIN}.`,
    );
    return { origin: OPTIMIZER_SERVICE_ORIGIN, stop: async () => {} };
  }

  await runToCompletion("docker", ["info"], { stdio: "ignore" }).catch(() => {
    throw new Error(
      "Docker is not running. Start Docker Desktop and run the command again.",
    );
  });

  console.log("Building Petrinaut Opt...");
  await runToCompletion("docker", [
    "build",
    "--file",
    "apps/petrinaut-opt/docker/Dockerfile",
    "--tag",
    image,
    ".",
  ]);

  console.log(`Starting Petrinaut Opt on ${OPTIMIZER_SERVICE_ORIGIN}...`);
  const containerId = (
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

  return {
    origin: OPTIMIZER_SERVICE_ORIGIN,
    stop: () =>
      runToCompletion("docker", ["stop", "--timeout", "5", containerId], {
        stdio: "ignore",
      }).catch(() => undefined),
  };
};

/**
 * Runs a dev server, with the optimizer service around it when the arguments
 * carry the flag. Resolves with the exit code the process should report.
 */
export const runDevServerWithOptionalService = async ({
  cliArguments,
  cwd,
  prepare,
  server,
}) => {
  const { withService, forwarded } = splitOptimizerServiceFlag(cliArguments);
  let service = null;
  try {
    if (withService) {
      service = await startOptimizerService();
    }
    const env = withService
      ? optimizerServiceEnvironment(process.env)
      : process.env;
    if (prepare) {
      await runToCompletion(prepare.command, prepare.args, { cwd, env });
    }
    return await runDevServer(server.command, [...server.args, ...forwarded], {
      cwd,
      env,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await service?.stop();
  }
};
