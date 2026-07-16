import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";

import { loadSdcpnModel } from "../runtime/load-model";
import {
  handleProtocolLine,
  MAX_REQUEST_LINE_BYTES,
} from "../runtime/protocol";

import type { Readable, Writable } from "node:stream";

type ServeStdioOptions = {
  modelPath: string;
  input?: Readable;
  output?: Writable;
  errorOutput?: Writable;
};

function writeResponse(output: Writable, value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`);
}

export async function serveStdio(options: ServeStdioOptions): Promise<void> {
  const modelPath = resolve(options.modelPath);
  const sdcpn = await loadSdcpnModel(modelPath);
  const model = compilePetrinautModel({ sdcpn });
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const lines = createInterface({ input, crlfDelay: Infinity });

  errorOutput.write(`Petrinaut stdio ready for model ${modelPath}\n`);

  for await (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > MAX_REQUEST_LINE_BYTES) {
      writeResponse(output, {
        id: null,
        error: { message: "Request line is too large" },
      });
      continue;
    }
    handleProtocolLine(model, line, (value) => writeResponse(output, value));
  }
}
