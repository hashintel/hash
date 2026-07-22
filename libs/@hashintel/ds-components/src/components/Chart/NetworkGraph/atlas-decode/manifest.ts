/**
 * Parsers for the two JSON reads that bootstrap a SALTILE session
 * (normative contract: `SPEC-ADDENDUM-API.md` "Surface v1"):
 * `GET /v1/atlas/current`, the one mutable read naming the active
 * generation, and the immutable per-generation manifest carrying the
 * canonical variant set, bucket schedule, and request caps.
 *
 * Both validate the schema and throw {@link AtlasContractError} on any
 * violation. The transport itself lives in the fetcher; these are pure
 * functions over already-parsed JSON.
 */

import { GENERATION_BYTES } from "./schema";

/** Response of `GET /v1/atlas/current` — the one mutable read. */
export interface AtlasCurrent {
  /** Active generation identity, 64 hex characters. */
  readonly generation: string;
}

/** Request caps served as data (never synchronized constants). */
export interface AtlasLimits {
  readonly coloredTypeIds: number;
  readonly edgesTiles: number;
  /** Most ego-graph edges one locate response delivers. */
  readonly locateEdges: number;
  /** Most properties one located entity ships in its trailer map. */
  readonly locateProperties: number;
  /** Most type ids one located link lists. */
  readonly locateLinkTypeIds: number;
  /** Most properties one located link ships. */
  readonly locateLinkProperties: number;
}

/** Immutable per-generation manifest. */
export interface AtlasManifest {
  readonly generation: string;
  readonly wireVersion: number;
  readonly variants: readonly string[];
  readonly bucketSchedule: {
    readonly span: number;
    readonly cut: string;
    readonly maxZoom: number;
  };
  readonly limits: AtlasLimits;
  readonly createdAt: string;
}

/** A JSON response violated the Surface v1 schema. */
export class AtlasContractError extends Error {
  override readonly name = "AtlasContractError";
}

const contractFail = (detail: string): never => {
  throw new AtlasContractError(detail);
};

const hexPattern = /^[0-9a-f]{64}$/u;

/** Decodes a 64-hex generation identity into its 32 raw bytes. */
export const generationBytes = (hex: string): Uint8Array => {
  if (!hexPattern.test(hex)) {
    contractFail(`generation is not 64 lowercase hex characters: ${hex}`);
  }
  const bytes = new Uint8Array(GENERATION_BYTES);
  for (let index = 0; index < GENERATION_BYTES; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const isUintValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

// Index-signature access with a variable key (host idiom: satisfies
// `dot-notation` and `noPropertyAccessFromIndexSignature` together).
const field = (record: Record<string, unknown>, key: string): unknown =>
  record[key];

/** Parses `GET /v1/atlas/current`, validating the generation identity. */
export const parseCurrent = (value: unknown): AtlasCurrent => {
  if (typeof value !== "object" || value === null) {
    return contractFail("current is not an object");
  }
  const generation = field(value as Record<string, unknown>, "generation");
  if (typeof generation !== "string") {
    return contractFail("current.generation must be a string");
  }
  // Validates the 64-hex shape; the bytes it returns are discarded here.
  generationBytes(generation);
  return { generation };
};

/** Parses a manifest body, checking it echoes the route's `generation`. */
export const parseManifest = (
  value: unknown,
  generation: string,
): AtlasManifest => {
  if (typeof value !== "object" || value === null) {
    return contractFail("manifest is not an object");
  }
  const manifest = value as Record<string, unknown>;
  if (field(manifest, "generation") !== generation) {
    return contractFail("manifest generation does not echo the route");
  }
  const wireVersion = field(manifest, "wireVersion");
  if (!isUintValue(wireVersion)) {
    return contractFail("manifest wireVersion must be an unsigned integer");
  }
  const variants = field(manifest, "variants");
  if (
    !Array.isArray(variants) ||
    variants.length === 0 ||
    !variants.every((entry) => typeof entry === "string")
  ) {
    return contractFail("manifest variants must be a non-empty string array");
  }
  const schedule = field(manifest, "bucketSchedule") as Record<
    string,
    unknown
  > | null;
  if (typeof schedule !== "object" || schedule === null) {
    return contractFail("manifest bucketSchedule is not an object");
  }
  const span = field(schedule, "span");
  const cut = field(schedule, "cut");
  const maxZoom = field(schedule, "maxZoom");
  if (!isUintValue(span) || !Number.isInteger(Math.log2(span))) {
    return contractFail(
      `bucketSchedule span must be a power of two (the per-tile grid width); got ${String(span)}`,
    );
  }
  if (typeof cut !== "string" || !isUintValue(maxZoom)) {
    return contractFail("bucketSchedule cut/maxZoom are malformed");
  }
  const limits = field(manifest, "limits") as Record<string, unknown> | null;
  if (typeof limits !== "object" || limits === null) {
    return contractFail("manifest limits are malformed");
  }
  const coloredTypeIds = field(limits, "coloredTypeIds");
  const edgesTiles = field(limits, "edgesTiles");
  const locateEdges = field(limits, "locateEdges");
  const locateProperties = field(limits, "locateProperties");
  const locateLinkTypeIds = field(limits, "locateLinkTypeIds");
  const locateLinkProperties = field(limits, "locateLinkProperties");
  if (
    !isUintValue(coloredTypeIds) ||
    !isUintValue(edgesTiles) ||
    !isUintValue(locateEdges) ||
    !isUintValue(locateProperties) ||
    !isUintValue(locateLinkTypeIds) ||
    !isUintValue(locateLinkProperties)
  ) {
    return contractFail("manifest limits are malformed");
  }
  const createdAt = field(manifest, "createdAt");
  if (typeof createdAt !== "string") {
    return contractFail("manifest createdAt must be an ISO-8601 string");
  }
  return {
    generation,
    wireVersion,
    variants,
    bucketSchedule: { span, cut, maxZoom },
    limits: {
      coloredTypeIds,
      edgesTiles,
      locateEdges,
      locateProperties,
      locateLinkTypeIds,
      locateLinkProperties,
    },
    createdAt,
  };
};
