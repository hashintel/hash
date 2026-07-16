import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

import { logger } from "../../logger";
import { getAnalysisMetadata } from "../shared/analysis-registry";
import {
  AnalysisArgError,
  AnalysisExecutionError,
  AnalysisNotFoundError,
  DatasetUnavailableError,
} from "../shared/errors";
import { isWebScopedKeyForWeb } from "../shared/storage-key";

import type { GraphApi } from "../../graph/context-types";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type {
  AnalysisInvocation,
  AnalysisResult,
} from "@local/hash-isomorphic-utils/analysis/types";
import type Keyv from "keyv";

/**
 * Presigned URLs are short-lived: the frontend re-runs the gateway when a URL
 * nears expiry rather than holding long-lived credentials. We cache the URL
 * (minus an offset) so repeat invocations within the window are cheap.
 */
const ANALYSIS_URL_EXPIRATION_SECONDS = 60 * 60;
const ANALYSIS_URL_CACHE_OFFSET_SECONDS = 60 * 5;

/**
 * Web ids are UUIDs. Validating shape before they reach authorisation or storage
 * key construction is cheap defence-in-depth (and yields clearer errors than a
 * downstream failure on a malformed id).
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidWebId = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

/** Internal sentinel for an authorisation failure on a specific web. */
class WebAuthorisationError extends Error {}

/** Cached presign payload: the URL plus its true expiry. */
interface CachedPresign {
  url: string;
  expiresAt: string;
}

export interface ResolveInvocationParams {
  invocation: AnalysisInvocation;
  actorId: ActorEntityUuid;
  graphApi: GraphApi;
  temporalClient: TemporalClient;
  uploadProvider: FileStorageProvider;
  cache: Keyv;
}

export const resolveInvocation = async ({
  invocation,
  actorId,
  graphApi,
  temporalClient,
  uploadProvider,
  cache,
}: ResolveInvocationParams): Promise<AnalysisResult> => {
  const id = typeof invocation.id === "string" ? invocation.id : "";
  const analysisName = invocation.analysis;
  const webId = invocation.webId;

  const asResult = (partial: Omit<AnalysisResult, "id">): AnalysisResult => ({
    id,
    ...partial,
  });

  if (typeof analysisName !== "string" || analysisName.length === 0) {
    return asResult({ status: "error", error: "Missing analysis name" });
  }

  const analysis = getAnalysisMetadata(analysisName);
  if (!analysis) {
    return asResult({
      status: "error",
      error: `Unknown analysis "${analysisName}"`,
    });
  }

  if (!isValidWebId(webId)) {
    return asResult({ status: "error", error: "A valid webId is required" });
  }

  // `args` is untrusted wire input, so validate its runtime shape rather than
  // trusting the declared type.
  const rawArgs: unknown = invocation.args;
  if (
    rawArgs !== undefined &&
    (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))
  ) {
    return asResult({ status: "error", error: "args must be an object" });
  }
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const requiredRole = analysis.requiredWebRole ?? "member";

  /**
   * Every artifact key an analysis resolves to must live under the authorised
   * web. Keys are built via `webScopedKey`, which puts the analysis prefix first
   * and the web id second, so an exact prefix + web segment match enforces that
   * a (buggy or compromised) analysis cannot presign an object outside the
   * caller's web. `resolve()` is otherwise free-form.
   */
  const keyWithinAuthorisedWeb = (key: string): boolean =>
    isWebScopedKeyForWeb(key, webId);

  try {
    const role = await getActorGroupRole(
      graphApi,
      { actorId },
      { actorId, actorGroupId: webId },
    );

    if (!role) {
      throw new WebAuthorisationError(`You do not have access to web ${webId}`);
    }

    if (requiredRole === "administrator" && role !== "administrator") {
      throw new WebAuthorisationError(
        `Administrator role required in web ${webId}`,
      );
    }

    const loadArtifact = async (key: string): Promise<Buffer | null> => {
      try {
        return await uploadProvider.downloadDirect({ key });
      } catch {
        return null;
      }
    };

    const getArtifactLastModified = (key: string): Promise<Date | null> =>
      uploadProvider.getObjectLastModified({ key });

    const resolution = await analysis.resolve({
      webId,
      actorId,
      args,
      loadArtifact,
      getArtifactLastModified,
      graphApi,
      temporalClient,
    });

    if (resolution.status === "computing") {
      return asResult({
        status: "computing",
        retryAfterMs: resolution.retryAfterMs ?? 1000,
      });
    }

    const refs = resolution.artifacts ?? [];

    const escapingRef = refs.find((ref) => !keyWithinAuthorisedWeb(ref.key));
    if (escapingRef) {
      logger.error(
        `Analysis "${analysisName}" resolved an artifact key outside the authorised webs [key=${escapingRef.key}]`,
      );
      return asResult({
        status: "error",
        error: "Resolved analysis artifact key outside the authorised web",
      });
    }

    const artifacts = await Promise.all(
      refs.map(async (ref) => {
        const cacheKey = `analysis-presign:${ref.key}`;
        let cached = await cache.get<CachedPresign>(cacheKey);

        if (!cached) {
          const url = await uploadProvider.presignDownloadByKey({
            key: ref.key,
            expiresInSeconds: ANALYSIS_URL_EXPIRATION_SECONDS,
          });
          cached = {
            url,
            expiresAt: new Date(
              Date.now() + ANALYSIS_URL_EXPIRATION_SECONDS * 1000,
            ).toISOString(),
          };

          try {
            await cache.set(
              cacheKey,
              cached,
              (ANALYSIS_URL_EXPIRATION_SECONDS -
                ANALYSIS_URL_CACHE_OFFSET_SECONDS) *
                1000,
            );
          } catch (error) {
            logger.warn(
              `Could not cache presigned analysis URL [key=${ref.key}]: ${error}`,
            );
          }
        }

        return {
          name: ref.name,
          format: ref.format ?? "json",
          url: cached.url,
          expiresAt: cached.expiresAt,
        };
      }),
    );

    return asResult({ status: "ready", artifacts });
  } catch (error) {
    if (
      error instanceof WebAuthorisationError ||
      error instanceof AnalysisExecutionError ||
      error instanceof AnalysisArgError ||
      error instanceof AnalysisNotFoundError ||
      error instanceof DatasetUnavailableError
    ) {
      return asResult({ status: "error", error: error.message });
    }

    logger.error(
      `Unexpected error resolving analysis "${analysisName}": ${
        error instanceof Error ? error.stack : String(error)
      }`,
    );
    return asResult({ status: "error", error: "Internal error" });
  }
};
