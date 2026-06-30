/**
 * Per-entity property FEATURES for distinctive-feature cluster naming.
 *
 * The worker holds entity property VALUES (shipped on {@link IngestEntity}) but never
 * needs their full fidelity: naming a cluster only needs to know which entities SHARE a
 * given `(property, value)`. So each scalar property value is reduced to a "feature" -- a
 * `(baseUrl, formatted-value)` pair -- and interned to a small integer, exactly like the
 * entity/type interners elsewhere. An entity then stores just the sorted list of its
 * feature indices, and the namer ({@link nameClustersByDistinctiveFeatures}) tallies
 * those across a cluster's members.
 *
 * "Scalars-plus": strings/numbers/booleans become a value feature; arrays collapse to a
 * count summary and nested objects to a presence token (weaker signals, but they cost
 * almost nothing and occasionally disambiguate). Property display TITLES are registered
 * separately (from {@link PropertySchemaEntry}) so a label reads "Destination = ..." and
 * not a raw base URL.
 *
 * Numbers and ISO dates ADDITIONALLY keep their RAW value (per entity, keyed by an interned
 * property base URL) so the namer can bucket them into per-subdivision quantile RANGES
 * ("Quantity 100–500"). An exact value feature is still produced too, so a low-cardinality
 * number (a status `= 0`) keeps naming by its exact value while a high-cardinality one
 * (every quantity distinct, so no exact value is ever common) is named by its range instead.
 */
import { Interner } from "../collections/interner";

import type { EntityIdx } from "../../ids";
import type { PropertySchemaEntry } from "../protocol";
import type { PropertyObject } from "@blockprotocol/type-system";

/** Interned index of a distinct `(baseUrl, formatted-value)` feature. */
export type FeatureIdx = number;

/** Interned index of a property base URL that carries numeric/date values. */
export type NumericKeyIdx = number;

/** Whether a numeric property reads as a plain number or an (epoch-ms) date. */
export type NumericKind = "number" | "date";

/** Cap a value's serialized length so a free-text property can't bloat the interner. */
const MAX_VALUE_CHARS = 64;

/**
 * ISO-8601 date / datetime: `YYYY-MM-DD` with an optional time and zone. Deliberately
 * strict so a plain numeric string or arbitrary text is NOT mistaken for a date (a far
 * looser `Date.parse` would treat "1" or "May" as dates).
 */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;

interface FeatureInfo {
  readonly baseUrl: string;
  /** The value as it appears in a label: `"foo"`, `123`, `true`, `3 items`, `present`. */
  readonly display: string;
}

/** What a feature renders to in a label. */
export interface FeatureLabel {
  readonly baseUrl: string;
  readonly title: string;
  readonly display: string;
}

/** A raw numeric reading: a plain number, or a date as epoch milliseconds. */
interface NumericReading {
  readonly value: number;
  readonly kind: NumericKind;
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_CHARS
    ? `${value.slice(0, MAX_VALUE_CHARS)}…`
    : value;
}

/**
 * Reduce a property value to its label display form, or undefined when it carries no
 * usable signal (empty string, empty array, null). Strings are quoted; numbers/booleans
 * are bare; arrays summarise to a count and nested objects to a presence token.
 */
function formatFeatureValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    // Collapse whitespace runs (and trim): folds fixed-width padding like "CNTM " into
    // "CNTM" so padded/unpadded values share a feature, and keeps a value on one label line.
    const collapsed = value.replace(/\s+/gu, " ").trim();
    return collapsed.length === 0 ? undefined : `"${truncate(collapsed)}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? undefined
      : `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (value !== null && typeof value === "object") {
    return "present";
  }
  return undefined;
}

/**
 * The raw numeric value (for range bucketing) of a property value, or undefined when it is
 * not a finite number or an ISO date. Dates collapse to epoch milliseconds so numbers and
 * dates share one ordered axis.
 */
function numericReading(value: unknown): NumericReading | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { value, kind: "number" } : undefined;
  }
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : { value: ms, kind: "date" };
  }
  return undefined;
}

/**
 * Title-case the slug of a property-type base URL (".../property-type/<slug>/") as a
 * fallback when no registered title is available, so a label never shows a raw URL.
 */
function slugTitleFromBaseUrl(baseUrl: string): string {
  const slug = /\/property-type\/(?<slug>[^/]+)\/?$/.exec(baseUrl)?.groups
    ?.slug;
  if (!slug) {
    return baseUrl;
  }
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export class PropertyStore {
  readonly #features: Interner<string, FeatureIdx> = new Interner();
  readonly #featureInfo: FeatureInfo[] = [];
  /** Per-entity sorted, de-duplicated feature indices, indexed by EntityIdx (dense, additive). */
  readonly #entityFeatures: (Int32Array | undefined)[] = [];
  /** baseUrl -> human title, from {@link PropertySchemaEntry}. */
  readonly #titles: Map<string, string> = new Map();

  /** baseUrl -> NumericKeyIdx, for properties that carry numeric/date values. */
  readonly #numericKeys: Interner<string, NumericKeyIdx> = new Interner();
  /** Parallel to the interner: per-key base URL and kind (number vs date). */
  readonly #numericKeyBaseUrl: string[] = [];
  readonly #numericKeyKind: NumericKind[] = [];
  /**
   * Per-entity raw numeric readings as two parallel arrays (key indices + values), indexed
   * by EntityIdx. Kept RAW (not interned) precisely because the namer buckets them into
   * ranges computed from the live distribution of a subdivision's siblings -- a value's
   * meaning ("low" vs "high") is relative, so it cannot be pre-interned like an exact value.
   */
  readonly #entityNumericKeys: (Int32Array | undefined)[] = [];
  readonly #entityNumericValues: (Float64Array | undefined)[] = [];

  /** Register property display titles (additive; later batches add, never overwrite). */
  registerTitles(entries: readonly PropertySchemaEntry[]): void {
    for (const { baseUrl, title } of entries) {
      if (title && !this.#titles.has(baseUrl)) {
        this.#titles.set(baseUrl, title);
      }
    }
  }

  /** Human title for a base URL: the registered property-type title, else a slug fallback. */
  title(baseUrl: string): string {
    return this.#titles.get(baseUrl) ?? slugTitleFromBaseUrl(baseUrl);
  }

  /**
   * Reduce an entity's properties to its interned scalar features AND its raw numeric/date
   * readings. No-op when the entity has no labelable property (a link, or only empty/complex
   * values).
   */
  ingest(entityIdx: EntityIdx, properties: PropertyObject | undefined): void {
    if (!properties) {
      return;
    }

    const featureIdxs = new Set<FeatureIdx>();
    const numericKeyIdxs: NumericKeyIdx[] = [];
    const numericValues: number[] = [];

    for (const [baseUrl, value] of Object.entries(properties)) {
      const display = formatFeatureValue(value);
      if (display !== undefined) {
        const [created, featureIdx] = this.#features.tryIntern(
          `${baseUrl}\u0000${display}`,
        );
        if (created) {
          this.#featureInfo.push({ baseUrl, display });
        }
        featureIdxs.add(featureIdx);
      }

      const reading = numericReading(value);
      if (reading) {
        const [created, keyIdx] = this.#numericKeys.tryIntern(baseUrl);
        if (created) {
          this.#numericKeyBaseUrl[keyIdx] = baseUrl;
          this.#numericKeyKind[keyIdx] = reading.kind;
        }
        numericKeyIdxs.push(keyIdx);
        numericValues.push(reading.value);
      }
    }

    if (featureIdxs.size > 0) {
      this.#entityFeatures[entityIdx] = Int32Array.from(
        [...featureIdxs].sort((left, right) => left - right),
      );
    }
    if (numericKeyIdxs.length > 0) {
      this.#entityNumericKeys[entityIdx] = Int32Array.from(numericKeyIdxs);
      this.#entityNumericValues[entityIdx] = Float64Array.from(numericValues);
    }
  }

  /** An entity's feature indices, or undefined if it has none. */
  featuresOf(entityIdx: EntityIdx): Int32Array | undefined {
    return this.#entityFeatures[entityIdx];
  }

  /** The base URL, title, and display value a feature renders to in a label. */
  describe(featureIdx: FeatureIdx): FeatureLabel | undefined {
    const info = this.#featureInfo[featureIdx];
    if (!info) {
      return undefined;
    }
    return {
      baseUrl: info.baseUrl,
      title: this.title(info.baseUrl),
      display: info.display,
    };
  }

  /** An entity's numeric-property key indices (parallel to {@link numericValuesOf}). */
  numericKeysOf(entityIdx: EntityIdx): Int32Array | undefined {
    return this.#entityNumericKeys[entityIdx];
  }

  /** An entity's raw numeric values (numbers, or dates as epoch ms; date-keyed by kind). */
  numericValuesOf(entityIdx: EntityIdx): Float64Array | undefined {
    return this.#entityNumericValues[entityIdx];
  }

  /** The base URL of a numeric property key, or undefined if unknown. */
  numericBaseUrl(keyIdx: NumericKeyIdx): string | undefined {
    return this.#numericKeyBaseUrl[keyIdx];
  }

  /** Whether a numeric property key reads as a plain number or a date. */
  numericKind(keyIdx: NumericKeyIdx): NumericKind {
    return this.#numericKeyKind[keyIdx] ?? "number";
  }
}
