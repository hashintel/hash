import type { RoleName, WebId } from "@blockprotocol/type-system";

/**
 * Reference to a stored artifact that a named analysis resolves to. The gateway
 * turns each into a short-lived, directly-fetchable URL.
 */
export interface ArtifactKeyRef {
  /** Logical name within the analysis result, e.g. `"graph"`. */
  name: string;
  /** Storage key, relative to the provider's default location. */
  key: string;
  /** Wire format hint surfaced to the client (defaults to `"json"`). */
  format?: string;
}

/** Context handed to a named analysis when resolving an invocation. */
export interface AnalysisResolutionContext {
  /**
   * The (already authorised) web the analysis is scoped to. Artifacts the
   * analysis resolves must live under this web's storage prefix.
   */
  webId: WebId;
  /** Validated-as-an-object analysis arguments (may be empty). */
  args: Record<string, unknown>;
  /**
   * Read a stored artifact's raw bytes by key, e.g. to load a dataset pointer
   * or manifest during resolution. Returns `null` if the object is missing.
   */
  loadArtifact: (key: string) => Promise<Buffer | null>;
}

/** The outcome of resolving a single invocation. */
export interface AnalysisResolution {
  status: "ready" | "computing";
  /** Present when `status === "ready"`. */
  artifacts?: ArtifactKeyRef[];
  /** Present when `status === "computing"`: client poll hint. */
  retryAfterMs?: number;
}

/**
 * A server-registered analysis. Each analysis owns its own argument validation
 * and (where relevant) dataset/manifest membership checks, keeping the gateway
 * and registry domain-agnostic.
 */
export interface NamedAnalysis {
  /** Unique name clients reference, e.g. `"productGraph"`. */
  name: string;
  /**
   * Minimum role the actor must hold in the scoped web. Defaults to `"member"`
   * (any web role grants access).
   */
  requiredWebRole?: RoleName;
  resolve: (ctx: AnalysisResolutionContext) => Promise<AnalysisResolution>;
}

const registry = new Map<string, NamedAnalysis>();

/** Register a named analysis. Throws if the name is already taken. */
export const registerAnalysis = (analysis: NamedAnalysis): void => {
  if (registry.has(analysis.name)) {
    throw new Error(`Analysis "${analysis.name}" is already registered`);
  }
  registry.set(analysis.name, analysis);
};

export const registerAnalyses = (analyses: readonly NamedAnalysis[]): void => {
  for (const analysis of analyses) {
    registerAnalysis(analysis);
  }
};

export const getAnalysisMetadata = (name: string): NamedAnalysis | undefined =>
  registry.get(name);

/** Exposed for tests: clear all registered analyses. */
export const clearAnalysisRegistry = (): void => {
  registry.clear();
};
