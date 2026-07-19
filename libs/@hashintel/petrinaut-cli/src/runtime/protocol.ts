import {
  keyMetricsByRequestedSelector,
  parseServerRunRequest,
  toPetrinautRunConfig,
} from "./run-request";

import type { OptimizationProtocol } from "./optimization";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

export const MAX_REQUEST_LINE_BYTES = 10 * 1024 * 1024;
const MAX_SUMMARY_FIELD_CHARACTERS = 100;

type ProtocolRequest = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

/**
 * Bounded description of one handled request, safe for diagnostics.
 *
 * The id and method are truncated client-supplied values; params and error
 * messages are deliberately absent because they can embed user-authored
 * content.
 */
export type ProtocolLineSummary = {
  id: string | number | null;
  method: string | null;
  outcome: "ok" | "error";
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeId(id: unknown): string | number | null {
  if (typeof id === "number") {
    return id;
  }
  if (typeof id === "string") {
    return id.slice(0, MAX_SUMMARY_FIELD_CHARACTERS);
  }
  return null;
}

export function handleProtocolLine(
  model: PetrinautCompiledModel,
  line: string,
  writeResponse: (value: unknown) => void,
  sdcpn?: SDCPN,
  optimization?: OptimizationProtocol,
): ProtocolLineSummary | null {
  if (line.trim() === "") {
    return null;
  }

  let id: unknown = null;
  let method: string | null = null;
  const summary = (outcome: "ok" | "error"): ProtocolLineSummary => ({
    id: summarizeId(id),
    method:
      method === null ? null : method.slice(0, MAX_SUMMARY_FIELD_CHARACTERS),
    outcome,
  });
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
    method = request.method;

    switch (request.method) {
      case "healthz":
        writeResponse({ id, result: { ok: true } });
        return summary("ok");
      case "metadata":
        writeResponse({ id, result: model.metadata });
        return summary("ok");
      case "run": {
        const runRequest = parseServerRunRequest(request.params ?? {});
        const result = keyMetricsByRequestedSelector(
          model.metadata,
          runRequest,
          model.run(toPetrinautRunConfig(model.metadata, runRequest, sdcpn)),
        );
        writeResponse({ id, result });
        return summary("ok");
      }
      case "optimization.describe":
        if (!optimization) {
          throw new Error(
            "optimization.describe requires an optimization manifest",
          );
        }
        writeResponse({ id, result: optimization.describe() });
        return summary("ok");
      case "optimization.evaluate":
        if (!optimization) {
          throw new Error(
            "optimization.evaluate requires an optimization manifest",
          );
        }
        writeResponse({
          id,
          result: optimization.evaluate(request.params ?? {}),
        });
        return summary("ok");
      default:
        throw new Error(`Unknown method "${request.method}"`);
    }
  } catch (error) {
    writeResponse({
      id,
      error: { message: getErrorMessage(error) },
    });
    return summary("error");
  }
}
