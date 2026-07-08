import { parseArgs } from "node:util";

import { serve } from "./commands/serve";

function printUsage(): void {
  process.stderr.write(`Usage:
  petrinaut serve --model <path> --socket <path>

Unix socket methods:
  healthz
  metadata
  run
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
      socket: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (parsed.values.help) {
    printUsage();
    return;
  }

  if (!parsed.values.model) {
    throw new Error("Missing required --model <path>");
  }
  if (!parsed.values.socket) {
    throw new Error("Missing required --socket <path>");
  }

  await serve({
    modelPath: parsed.values.model,
    socketPath: parsed.values.socket,
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
