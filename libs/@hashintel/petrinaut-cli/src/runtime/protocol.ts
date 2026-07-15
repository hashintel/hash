import { parseServerRunRequest, toPetrinautRunConfig } from "./run-request";

import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

export const MAX_REQUEST_LINE_BYTES = 10 * 1024 * 1024;

type ProtocolRequest = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function handleProtocolLine(
  model: PetrinautCompiledModel,
  line: string,
  writeResponse: (value: unknown) => void,
): void {
  if (line.trim() === "") {
    return;
  }

  let id: unknown = null;
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Request must be a JSON object");
    }
    const request = value as ProtocolRequest;
    id = request.id ?? null;
    if (typeof request.method !== "string") {
      throw new Error("Request method must be a string");
    }

    switch (request.method) {
      case "healthz":
        writeResponse({ id, result: { ok: true } });
        return;
      case "metadata":
        writeResponse({ id, result: model.metadata });
        return;
      case "run": {
        const runRequest = parseServerRunRequest(request.params ?? {});
        const result = model.run(
          toPetrinautRunConfig(model.metadata, runRequest),
        );
        writeResponse({ id, result });
        return;
      }
      default:
        throw new Error(`Unknown method "${request.method}"`);
    }
  } catch (error) {
    writeResponse({
      id,
      error: { message: getErrorMessage(error) },
    });
  }
}
