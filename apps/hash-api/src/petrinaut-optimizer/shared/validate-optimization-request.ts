import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";
import type { Logger } from "@local/hash-backend-utils/logger";

export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const MAX_VALIDATION_ISSUES = 5;
export const MAX_VALIDATION_MESSAGE_LENGTH = 300;
// Manifest keys (e.g. scenario parameter identifiers) are user-controlled and
// unbounded, so cap each path segment before it reaches a response or a log.
export const MAX_VALIDATION_PATH_SEGMENT_LENGTH = 100;
// A trial repeats optimized parameter identifiers from the accepted manifest,
// so use the same bound rather than rejecting a valid large search space.
export const MAX_EVENT_BYTES = MAX_REQUEST_BYTES;
export const INVALID_OPTIMIZATION_REQUEST = {
  code: "invalid_optimization_request",
  error: "Invalid optimization request",
} as const;

/** Cap one user-controlled value before it reaches a response or a log. */
export const capPathSegment = (segment: string): string =>
  segment.slice(0, MAX_VALIDATION_PATH_SEGMENT_LENGTH);

/** Return a bounded, transport-stable summary of manifest validation errors. */
export const summarizeValidationIssues = (
  issues: readonly { message: string; path: readonly PropertyKey[] }[],
) => ({
  issues: issues.slice(0, MAX_VALIDATION_ISSUES).map(({ message, path }) => ({
    path:
      path.map((segment) => capPathSegment(String(segment))).join(".") || "$",
    message: message.slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
  })),
  truncated: issues.length > MAX_VALIDATION_ISSUES,
});

export type OptimizationRequestValidation =
  | {
      ok: true;
      bodyBytes: number;
      input: PetrinautOptimizationInput;
    }
  | {
      ok: false;
      status: 400 | 413;
      body: Record<string, unknown>;
    };

/**
 * Enforce the size cap and manifest schema shared by every create route.
 *
 * Rejections are logged here with the same discipline as the legacy handler:
 * only sizes, issue counts, and capped schema paths — never the validation
 * messages or the manifest itself, which can embed user-authored code.
 */
export const validateOptimizationRequest = ({
  body,
  requestLogger,
  userId,
}: {
  body: unknown;
  requestLogger: Pick<Logger, "warn">;
  userId: string;
}): OptimizationRequestValidation => {
  let serializedBody: unknown;
  try {
    serializedBody = JSON.stringify(body);
  } catch {
    return { ok: false, status: 400, body: INVALID_OPTIMIZATION_REQUEST };
  }
  if (typeof serializedBody !== "string") {
    return { ok: false, status: 400, body: INVALID_OPTIMIZATION_REQUEST };
  }
  const bodyBytes = Buffer.byteLength(serializedBody, "utf8");
  if (bodyBytes > MAX_REQUEST_BYTES) {
    requestLogger.warn("Petrinaut optimization rejected: body too large", {
      bodyBytes,
      userId,
    });
    return {
      ok: false,
      status: 413,
      body: { error: "Optimization request is too large" },
    };
  }

  const input = petrinautOptimizationInputSchema.safeParse(body);
  if (!input.success) {
    const details = summarizeValidationIssues(input.error.issues);
    requestLogger.warn("Petrinaut optimization request failed validation", {
      issueCount: input.error.issues.length,
      issuePaths: details.issues.map((issue) => issue.path),
      issuePathsTruncated: details.truncated,
      userId,
    });
    return {
      ok: false,
      status: 400,
      body: { ...INVALID_OPTIMIZATION_REQUEST, details },
    };
  }

  return { ok: true, bodyBytes, input: input.data };
};
