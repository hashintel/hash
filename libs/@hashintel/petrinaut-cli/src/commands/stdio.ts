import { resolve } from "node:path";
import { createInterface } from "node:readline";

import { compilePetrinautModel } from "@hashintel/petrinaut-core/compiled-model";

import { loadSdcpnModel, parseSdcpnModel } from "../runtime/load-model";
import {
  createOptimizationProtocol,
  loadOptimizationManifest,
  parseOptimizationManifest,
} from "../runtime/optimization";
import {
  handleProtocolLine,
  MAX_REQUEST_LINE_BYTES,
} from "../runtime/protocol";

import type {
  PetrinautOptimizationManifest,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { Readable, Writable } from "node:stream";

export const MAX_STDIN_SOURCE_LINE_BYTES = 8 * 1024 * 1024;

type ServeStdioOptions = (
  | {
      modelPath: string;
      modelStdin?: false;
      optimizationPath?: undefined;
      optimizationStdin?: false;
    }
  | {
      modelPath?: undefined;
      modelStdin: true;
      optimizationPath?: undefined;
      optimizationStdin?: false;
    }
  | {
      modelPath?: undefined;
      modelStdin?: false;
      optimizationPath: string;
      optimizationStdin?: false;
    }
  | {
      modelPath?: undefined;
      modelStdin?: false;
      optimizationPath?: undefined;
      optimizationStdin: true;
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
  let optimizationManifest: PetrinautOptimizationManifest | undefined;
  if (options.modelStdin || options.optimizationStdin) {
    const bootstrap = await iterator.next();
    if (bootstrap.done) {
      throw new Error(
        options.optimizationStdin
          ? "Missing optimization manifest JSON on stdin"
          : "Missing model JSON on stdin",
      );
    }
    if (
      Buffer.byteLength(bootstrap.value, "utf8") > MAX_STDIN_SOURCE_LINE_BYTES
    ) {
      throw new Error(
        options.optimizationStdin
          ? "Optimization manifest JSON line is too large"
          : "Model JSON line is too large",
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(bootstrap.value);
    } catch {
      throw new Error(
        options.optimizationStdin
          ? "Optimization manifest stdin line must be valid JSON"
          : "Model stdin line must be valid JSON",
      );
    }
    if (options.optimizationStdin) {
      optimizationManifest = parseOptimizationManifest(data);
      sdcpn = optimizationManifest.model.definition;
    } else {
      sdcpn = parseSdcpnModel(data);
    }
    modelLabel = "<stdin>";
  } else if (options.optimizationPath) {
    const optimizationPath = resolve(options.optimizationPath);
    optimizationManifest = await loadOptimizationManifest(optimizationPath);
    sdcpn = optimizationManifest.model.definition;
    modelLabel = optimizationPath;
  } else if (options.modelPath) {
    const modelPath = resolve(options.modelPath);
    sdcpn = await loadSdcpnModel(modelPath);
    modelLabel = modelPath;
  } else {
    throw new Error("Missing Petrinaut model source");
  }

  const model = compilePetrinautModel({ sdcpn });
  const optimization = optimizationManifest
    ? createOptimizationProtocol({ manifest: optimizationManifest, model })
    : undefined;

  errorOutput.write(
    `Petrinaut stdio ready for ${optimization ? "optimization manifest" : "model"} ${modelLabel}\n`,
  );

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
      optimization,
    );
  }
}
