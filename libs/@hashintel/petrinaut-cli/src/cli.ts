import { parseArgs } from "node:util";

import { serve } from "./commands/serve";

function printUsage(): void {
  process.stderr.write(`Usage:
  petrinaut serve --model <path> --socket <path>
  petrinaut serve --model <path> --host 127.0.0.1 --port 8765

Endpoints:
  GET  /healthz
  GET  /metadata
  POST /runs
`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "serve") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const parsed = parseArgs({
    args,
    options: {
      model: { type: "string" },
      structure: { type: "string" },
      socket: { type: "string" },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (parsed.values.help) {
    printUsage();
    return;
  }

  const modelPath = parsed.values.model ?? parsed.values.structure;
  if (!modelPath) {
    throw new Error("Missing required --model <path>");
  }

  const port =
    parsed.values.port === undefined
      ? undefined
      : Number.parseInt(parsed.values.port, 10);
  if (parsed.values.port !== undefined && !Number.isInteger(port)) {
    throw new Error(`Invalid --port value: ${parsed.values.port}`);
  }

  await serve({
    modelPath,
    ...(parsed.values.socket ? { socketPath: parsed.values.socket } : {}),
    host: parsed.values.host ?? "127.0.0.1",
    ...(port !== undefined ? { port } : {}),
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
