import { parseArgs } from "node:util";

import { serve } from "./commands/serve";
import { serveStdio } from "./commands/stdio";

function printUsage(): void {
  process.stderr.write(`Usage:
  petrinaut serve --model <path> [--stdio | --socket <path>]

Transports:
  --stdio          JSON lines over stdin/stdout (default)
  --socket <path>  JSON lines over a Unix socket

Methods:
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
      stdio: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (parsed.values.stdio && parsed.values.socket !== undefined) {
    throw new Error("--stdio and --socket cannot be used together");
  }
  if (parsed.values.help) {
    printUsage();
    return;
  }
  if (!parsed.values.model) {
    throw new Error("Missing required --model <path>");
  }

  if (parsed.values.socket !== undefined) {
    if (parsed.values.socket.trim() === "") {
      throw new Error("--socket requires a non-empty path");
    }
    await serve({
      modelPath: parsed.values.model,
      socketPath: parsed.values.socket,
    });
  } else {
    await serveStdio({ modelPath: parsed.values.model });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
