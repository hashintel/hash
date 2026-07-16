import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";

import { loadSdcpnModel, parseSdcpnModel } from "../runtime/load-model";
import {
  handleProtocolLine,
  MAX_REQUEST_LINE_BYTES,
} from "../runtime/protocol";

import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Readable, Writable } from "node:stream";

export const MAX_STDIN_MODEL_LINE_BYTES = 8 * 1024 * 1024;

type ServeStdioOptions = (
  | { modelPath: string; modelStdin?: false }
  | {
      modelPath?: undefined;
      modelStdin: true;
    }
) & {
  input?: Readable;
  output?: Writable;
  errorOutput?: Writable;
};

function writeResponse(output: Writable, value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`);
}

export async function serveStdio(options: ServeStdioOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const lines = createInterface({ input, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();

  let modelLabel: string;
  let sdcpn: SDCPN;
  if (options.modelStdin) {
    const bootstrap = await iterator.next();
    if (bootstrap.done) {
      throw new Error("Missing model JSON on stdin");
    }
    if (
      Buffer.byteLength(bootstrap.value, "utf8") > MAX_STDIN_MODEL_LINE_BYTES
    ) {
      throw new Error("Model JSON line is too large");
    }

    let data: unknown;
    try {
      data = JSON.parse(bootstrap.value);
    } catch {
      throw new Error("Model stdin line must be valid JSON");
    }
    sdcpn = parseSdcpnModel(data);
    modelLabel = "<stdin>";
  } else {
    const modelPath = resolve(options.modelPath);
    sdcpn = await loadSdcpnModel(modelPath);
    modelLabel = modelPath;
  }

  const model = compilePetrinautModel({ sdcpn });

  errorOutput.write(`Petrinaut stdio ready for model ${modelLabel}\n`);

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      break;
    }
    const line = next.value;
    if (Buffer.byteLength(line, "utf8") > MAX_REQUEST_LINE_BYTES) {
      writeResponse(output, {
        id: null,
        error: { message: "Request line is too large" },
      });
      continue;
    }
    handleProtocolLine(
      model,
      line,
      (value) => writeResponse(output, value),
      sdcpn,
    );
  }
}
