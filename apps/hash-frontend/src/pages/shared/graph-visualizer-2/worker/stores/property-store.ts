/**
 * Per-entity property features for cluster naming.
 *
 * Each scalar property value is reduced to a `(baseUrl, formatted-value)` pair
 * and interned. Numbers and ISO dates additionally keep their raw value for
 * quantile range bucketing.
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

/** Strict ISO-8601 date/datetime. Rejects bare numbers and partial strings that `Date.parse` accepts. */
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
 * Format a property value for display, or `undefined` when it carries no signal.
 *
 * Strings are quoted, numbers/booleans are bare, arrays become a count,
 * nested objects become `"present"`.
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
 * Numeric value of a property, or `undefined` when not a finite number or ISO date.
 *
 * Dates collapse to epoch milliseconds.
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

/** Title-case the slug from a property-type base URL as a fallback display title. */
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
  // Raw (not interned): range bucketing depends on the live distribution of
  // a cluster's members, so values can't be pre-interned.
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
   * Extract scalar features and numeric readings from an entity's properties.
   *
   * No-op when the entity has no labelable property.
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

  /** Sorted feature indices for an entity, or `undefined` if it has none. */
  featuresOf(entityIdx: EntityIdx): Int32Array | undefined {
    return this.#entityFeatures[entityIdx];
  }

  /** Resolve a feature index to its display label. */
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

  /** Numeric property key indices, parallel to {@link numericValuesOf}. */
  numericKeysOf(entityIdx: EntityIdx): Int32Array | undefined {
    return this.#entityNumericKeys[entityIdx];
  }

  /** Raw numeric values (numbers, or dates as epoch ms). */
  numericValuesOf(entityIdx: EntityIdx): Float64Array | undefined {
    return this.#entityNumericValues[entityIdx];
  }

  numericBaseUrl(keyIdx: NumericKeyIdx): string | undefined {
    return this.#numericKeyBaseUrl[keyIdx];
  }

  numericKind(keyIdx: NumericKeyIdx): NumericKind {
    return this.#numericKeyKind[keyIdx] ?? "number";
  }
}
