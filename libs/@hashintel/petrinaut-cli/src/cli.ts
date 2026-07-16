import { parseArgs } from "node:util";

import { serve } from "./commands/serve";
import { serveStdio } from "./commands/stdio";

function printUsage(): void {
  process.stderr.write(`Usage:
  petrinaut serve (--model <path> | --model-stdin) [--stdio | --socket <path>]

Transports:
  --stdio          JSON lines over stdin/stdout (default)
  --socket <path>  JSON lines over a Unix socket

Model sources:
  --model <path>   Load the model from a JSON file
  --model-stdin    Read a legacy model JSON object from the first stdin line

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
      "model-stdin": { type: "boolean" },
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
  const modelPath = parsed.values.model;
  const modelStdin = parsed.values["model-stdin"] ?? false;
  if (modelPath && modelStdin) {
    throw new Error("--model and --model-stdin cannot be used together");
  }
  if (!modelPath && !modelStdin) {
    throw new Error("Missing required --model <path> or --model-stdin");
  }
  if (modelStdin && parsed.values.socket !== undefined) {
    throw new Error("--model-stdin is only available with the stdio transport");
  }

  if (parsed.values.socket !== undefined) {
    if (parsed.values.socket.trim() === "") {
      throw new Error("--socket requires a non-empty path");
    }
    if (!modelPath) {
      throw new Error("--socket requires --model <path>");
    }
    await serve({
      modelPath,
      socketPath: parsed.values.socket,
    });
  } else if (modelStdin) {
    await serveStdio({ modelStdin: true });
  } else if (modelPath) {
    await serveStdio({ modelPath });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
