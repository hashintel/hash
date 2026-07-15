import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { compilePetrinautModel } from "@hashintel/petrinaut-core";

import { loadSdcpnModel } from "../runtime/load-model";
import {
  handleProtocolLine,
  MAX_REQUEST_LINE_BYTES,
} from "../runtime/protocol";

type ServeStdioOptions = {
  modelPath: string;
};

function writeResponse(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export async function serveStdio(options: ServeStdioOptions): Promise<void> {
  const modelPath = resolve(options.modelPath);
  const sdcpn = await loadSdcpnModel(modelPath);
  const model = compilePetrinautModel({ sdcpn });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

  process.stderr.write(`Petrinaut stdio ready for model ${modelPath}\n`);

  for await (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > MAX_REQUEST_LINE_BYTES) {
      writeResponse({
        id: null,
        error: { message: "Request line is too large" },
      });
      continue;
    }
    handleProtocolLine(model, line, writeResponse);
  }
}
