import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const suffix = randomUUID().slice(0, 8);
const applicationContainer = `brunch-agent-smoke-${suffix}`;
const collectorContainer = `brunch-otel-smoke-${suffix}`;
const databaseContainer = `brunch-postgres-smoke-${suffix}`;
const network = `brunch-agent-smoke-${suffix}`;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "brunch-container-smoke-"),
);
const certificate = join(temporaryDirectory, "server.crt");
const privateKey = join(temporaryDirectory, "server.key");
const collectorConfig = join(temporaryDirectory, "otel-collector.yaml");

const run = async (
  executable: string,
  arguments_: readonly string[],
): Promise<{ stderr: string; stdout: string }> =>
  executeFile(executable, [...arguments_], {
    maxBuffer: 10 * 1024 * 1024,
  });

const removeContainer = async (name: string): Promise<void> => {
  try {
    await run("docker", ["rm", "--force", name]);
  } catch {
    // A container that never started needs no cleanup.
  }
};

const waitUntil = async (
  description: string,
  check: () => Promise<boolean>,
): Promise<void> => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- readiness probes are intentionally sequential.
    if (await check()) return;
    // eslint-disable-next-line no-await-in-loop -- polling must pause between attempts.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
};

try {
  await run("openssl", [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-x509",
    "-days",
    "1",
    "-subj",
    `/CN=${databaseContainer}`,
    "-addext",
    `subjectAltName=DNS:${databaseContainer}`,
    "-keyout",
    privateKey,
    "-out",
    certificate,
  ]);
  await writeFile(
    collectorConfig,
    `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  debug:
    verbosity: basic
service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    traces:
      receivers: [otlp]
      exporters: [debug]
`.trimStart(),
  );

  await run("docker", ["network", "create", network]);
  await run("docker", [
    "run",
    "--detach",
    "--name",
    collectorContainer,
    "--network",
    network,
    "--volume",
    `${collectorConfig}:/etc/otelcol/config.yaml:ro`,
    "otel/opentelemetry-collector:0.159.0",
    "--config=/etc/otelcol/config.yaml",
  ]);
  await run("docker", [
    "run",
    "--detach",
    "--name",
    databaseContainer,
    "--network",
    network,
    "--env",
    "POSTGRES_DB=brunch",
    "--env",
    "POSTGRES_PASSWORD=container-smoke-password",
    "--volume",
    `${temporaryDirectory}:/tls:ro`,
    "--entrypoint",
    "bash",
    "postgres:17-bookworm",
    "-euc",
    [
      "cp /tls/server.crt /var/lib/postgresql/server.crt",
      "cp /tls/server.key /var/lib/postgresql/server.key",
      "chown postgres:postgres /var/lib/postgresql/server.crt /var/lib/postgresql/server.key",
      "chmod 600 /var/lib/postgresql/server.key",
      "exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/var/lib/postgresql/server.crt -c ssl_key_file=/var/lib/postgresql/server.key",
    ].join(" && "),
  ]);

  await waitUntil("Postgres", async () => {
    try {
      await run("docker", [
        "exec",
        databaseContainer,
        "pg_isready",
        "--host",
        "127.0.0.1",
        "--dbname",
        "brunch",
        "--username",
        "postgres",
      ]);
      return true;
    } catch {
      return false;
    }
  });

  await run("docker", [
    "run",
    "--detach",
    "--name",
    applicationContainer,
    "--network",
    network,
    "--env",
    "NODE_ENV=production",
    "--env",
    "BRUNCH_POSTGRES_AUTH_MODE=password",
    "--env",
    `BRUNCH_POSTGRES_HOST=${databaseContainer}`,
    "--env",
    "BRUNCH_POSTGRES_PORT=5432",
    "--env",
    "BRUNCH_POSTGRES_DATABASE=brunch",
    "--env",
    "BRUNCH_POSTGRES_USER=postgres",
    "--env",
    "BRUNCH_POSTGRES_PASSWORD=container-smoke-password",
    "--env",
    "BRUNCH_POSTGRES_TLS_CA_PATH=/run/config/rds-ca.pem",
    "--env",
    `HASH_OTLP_ENDPOINT=http://${collectorContainer}:4317`,
    "--volume",
    `${certificate}:/run/config/rds-ca.pem:ro`,
    "brunch-agent",
  ]);

  try {
    await waitUntil("Brunch health", async () => {
      try {
        await run("docker", [
          "exec",
          applicationContainer,
          "node",
          "-e",
          "const response = await fetch('http://127.0.0.1:3002/health'); if (!response.ok) process.exit(1)",
        ]);
        return true;
      } catch {
        return false;
      }
    });
  } catch (error) {
    const { stderr, stdout } = await run("docker", [
      "logs",
      applicationContainer,
    ]);
    throw new AggregateError(
      [error],
      `Brunch failed to become healthy:\n${stdout}\n${stderr}`,
    );
  }

  const { stdout: userId } = await run("docker", [
    "exec",
    applicationContainer,
    "id",
    "-u",
  ]);
  if (userId.trim() !== "60000") {
    throw new Error(`Expected non-root uid 60000, received ${userId.trim()}.`);
  }

  await run("docker", [
    "exec",
    applicationContainer,
    "node",
    "-e",
    [
      "const health = await fetch('http://127.0.0.1:3002/health')",
      "if (health.headers.get('content-type') !== 'application/health+json') process.exit(1)",
      "if (JSON.stringify(await health.json()) !== JSON.stringify({ status: 'pass' })) process.exit(1)",
      "const root = await fetch('http://127.0.0.1:3002/')",
      "if (!root.ok || !(await root.text()).includes('/assets/index.js')) process.exit(1)",
    ].join(";"),
  ]);
  await run("docker", [
    "exec",
    applicationContainer,
    "node",
    "-e",
    [
      "const fs = await import('node:fs/promises')",
      "const files = (await fs.readdir('dist')).filter((file) => file.endsWith('.mjs'))",
      "const bundle = (await Promise.all(files.map((file) => fs.readFile('dist/' + file, 'utf8')))).join('\\n')",
      "if (!bundle.includes('sdcpn-modelling')) process.exit(1)",
    ].join(";"),
  ]);

  const { stdout: repositoryChanges } = await run("docker", [
    "diff",
    applicationContainer,
  ]);
  if (
    repositoryChanges
      .split("\n")
      .some((line) => line.trim().match(/^[ACD] \/repo(?:\/|$)/u))
  ) {
    throw new Error(`Container wrote under /repo:\n${repositoryChanges}`);
  }

  let refusalOutput = "";
  try {
    await run("docker", [
      "run",
      "--rm",
      "--network",
      network,
      "--env",
      "NODE_ENV=production",
      "--env",
      `HASH_OTLP_ENDPOINT=http://${collectorContainer}:4317`,
      "brunch-agent",
    ]);
    throw new Error("Image started without required database configuration.");
  } catch (error) {
    refusalOutput =
      error instanceof Error && "stderr" in error
        ? String((error as Error & { stderr: unknown }).stderr)
        : String(error);
  }
  if (!refusalOutput.includes("BRUNCH_POSTGRES_AUTH_MODE")) {
    throw new Error(
      `Missing database configuration did not fail clearly:\n${refusalOutput}`,
    );
  }

  await run("docker", ["stop", "--time", "70", applicationContainer]);
  const { stderr: applicationLogErrors, stdout: applicationLogs } = await run(
    "docker",
    ["logs", applicationContainer],
  );
  if (
    `${applicationLogs}\n${applicationLogErrors}`.includes(
      "[flue] Shutdown timed out",
    )
  ) {
    throw new Error("Generated Flue shutdown exceeded its 60-second window.");
  }
  const { stderr: collectorLogErrors, stdout: collectorLogs } = await run(
    "docker",
    ["logs", collectorContainer],
  );
  const collectorOutput = `${collectorLogs}\n${collectorLogErrors}`;
  if (
    !collectorOutput.includes('"otelcol.signal": "traces"') ||
    !collectorOutput.includes('"spans":')
  ) {
    throw new Error(
      `Container smoke did not observe Brunch OTel export:\n${collectorOutput}`,
    );
  }

  process.stdout.write("Brunch container smoke passed.\n");
} finally {
  await removeContainer(applicationContainer);
  await removeContainer(databaseContainer);
  await removeContainer(collectorContainer);
  try {
    await run("docker", ["network", "rm", network]);
  } catch {
    // The network may not have been created.
  }
  await rm(temporaryDirectory, { force: true, recursive: true });
}
