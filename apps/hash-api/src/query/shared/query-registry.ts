import type { RoleName, WebId } from "@blockprotocol/type-system";

/**
 * Reference to a stored artifact that a named query resolves to. The gateway
 * turns each into a short-lived, directly-fetchable URL.
 */
export interface ArtifactKeyRef {
  /** Logical name within the query result, e.g. `"graph"`. */
  name: string;
  /** Storage key, relative to the provider's default location. */
  key: string;
  /** Wire format hint surfaced to the client (defaults to `"json"`). */
  format?: string;
}

/** Context handed to a named query when resolving an invocation. */
export interface QueryResolutionContext {
  /**
   * The primary web the query is scoped to. For single-web queries this is the
   * (already authorised) web the artifacts live under.
   */
  webId: WebId;
  /** All authorised webs from the invocation (for future cross-web queries). */
  webIds: WebId[];
  /** Validated-as-an-object query arguments (may be empty). */
  args: Record<string, unknown>;
  /**
   * Read a stored artifact's raw bytes by key, e.g. to load a dataset pointer
   * or manifest during resolution. Returns `null` if the object is missing.
   */
  loadArtifact: (key: string) => Promise<Buffer | null>;
}

/** The outcome of resolving a single invocation. */
export interface QueryResolution {
  status: "ready" | "computing";
  /** Present when `status === "ready"`. */
  artifacts?: ArtifactKeyRef[];
  /** Present when `status === "computing"`: client poll hint. */
  retryAfterMs?: number;
}

/**
 * A server-registered query. Each query owns its own argument validation and
 * (where relevant) dataset/manifest membership checks, keeping the gateway and
 * registry domain-agnostic.
 */
export interface NamedQuery {
  /** Unique name clients reference, e.g. `"productGraph"`. */
  name: string;
  /**
   * Minimum role the actor must hold in each scoped web. Defaults to `"member"`
   * (any web role grants access).
   */
  requiredWebRole?: RoleName;
  resolve: (ctx: QueryResolutionContext) => Promise<QueryResolution>;
}

const registry = new Map<string, NamedQuery>();

/** Register a named query. Throws if the name is already taken. */
export const registerQuery = (query: NamedQuery): void => {
  if (registry.has(query.name)) {
    throw new Error(`Query "${query.name}" is already registered`);
  }
  registry.set(query.name, query);
};

export const registerQueries = (queries: readonly NamedQuery[]): void => {
  for (const query of queries) {
    registerQuery(query);
  }
};

export const getQuery = (name: string): NamedQuery | undefined =>
  registry.get(name);

/** Exposed for tests: clear all registered queries. */
export const clearQueryRegistry = (): void => {
  registry.clear();
};
