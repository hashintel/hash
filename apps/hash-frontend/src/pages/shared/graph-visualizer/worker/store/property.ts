/**
 * Per-entity property features for cluster naming.
 *
 * Each scalar property value is reduced to a `(baseUrl, formatted-value)` pair
 * and interned. Numbers and ISO dates additionally keep their raw value for
 * quantile range bucketing.
 */
import { Interner } from "../collections/interner";

import type { EntityIndex } from "../../ids";
import type { PropertySchemaEntry } from "../protocol";
import type { PropertyObject } from "@blockprotocol/type-system";

/** Interned index of a distinct `(baseUrl, formatted-value)` feature. */
export type FeatureId = number;

/** Interned index of a property base URL that carries numeric/date values. */
export type NumericKeyId = number;

/** Whether a numeric property reads as a plain number or an (epoch-ms) date. */
export type NumericKind = "number" | "date";

const MAX_VALUE_CHARS = 64;

/** Strict ISO-8601 date/datetime. Rejects bare numbers and partial strings that `Date.parse` accepts. */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;

interface FeatureInfo {
  readonly baseUrl: string;
  readonly display: string;
}

export interface FeatureLabel {
  readonly baseUrl: string;
  readonly title: string;
  readonly display: string;
}

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
  readonly #features: Interner<string, FeatureId>;
  readonly #featureInfo: FeatureInfo[];
  readonly #entityFeatures: (Int32Array | undefined)[];
  readonly #titles: Map<string, string>;

  readonly #numericKeys: Interner<string, NumericKeyId>;
  readonly #numericKeyBaseUrl: string[];
  readonly #numericKeyKind: NumericKind[];
  // Raw (not interned): range bucketing depends on the live distribution of
  // a cluster's members, so values can't be pre-interned.
  readonly #entityNumericKeys: (Int32Array | undefined)[];
  readonly #entityNumericValues: (Float64Array | undefined)[];

  constructor() {
    this.#features = new Interner();
    this.#featureInfo = [];
    this.#entityFeatures = [];
    this.#titles = new Map();

    this.#numericKeys = new Interner();
    this.#numericKeyBaseUrl = [];
    this.#numericKeyKind = [];
    this.#entityNumericKeys = [];
    this.#entityNumericValues = [];
  }

  /** Register property display titles. Returns true if any new title was added. */
  registerTitles(entries: readonly PropertySchemaEntry[]): boolean {
    let added = false;
    for (const { baseUrl, title } of entries) {
      if (title && !this.#titles.has(baseUrl)) {
        this.#titles.set(baseUrl, title);
        added = true;
      }
    }
    return added;
  }

  /** Human title for a base URL, falling back to a slug-derived title. */
  title(baseUrl: string): string {
    return this.#titles.get(baseUrl) ?? slugTitleFromBaseUrl(baseUrl);
  }

  /**
   * Extract scalar features and numeric readings from an entity's properties.
   *
   * No-op when `properties` is undefined. Calling again for the same
   * `index` overwrites its previously stored feature and numeric arrays;
   * feature ids are stored sorted in ascending order.
   */
  ingest(index: EntityIndex, properties: PropertyObject | undefined): void {
    if (!properties) {
      return;
    }

    const featureIds = new Set<FeatureId>();
    const numericKeyIds: NumericKeyId[] = [];
    const numericValues: number[] = [];

    for (const [baseUrl, value] of Object.entries(properties)) {
      const display = formatFeatureValue(value);
      if (display !== undefined) {
        const [created, featureId] = this.#features.tryIntern(
          `${baseUrl}\u0000${display}`,
        );
        if (created) {
          this.#featureInfo.push({ baseUrl, display });
        }
        featureIds.add(featureId);
      }

      const reading = numericReading(value);
      if (reading) {
        const [created, keyId] = this.#numericKeys.tryIntern(baseUrl);
        if (created) {
          this.#numericKeyBaseUrl[keyId] = baseUrl;
          this.#numericKeyKind[keyId] = reading.kind;
        }
        numericKeyIds.push(keyId);
        numericValues.push(reading.value);
      }
    }

    if (featureIds.size > 0) {
      this.#entityFeatures[index] = Int32Array.from(
        [...featureIds].sort((left, right) => left - right),
      );
    }
    if (numericKeyIds.length > 0) {
      this.#entityNumericKeys[index] = Int32Array.from(numericKeyIds);
      this.#entityNumericValues[index] = Float64Array.from(numericValues);
    }
  }

  /** Sorted feature indices for an entity, or `undefined` if it has none. */
  featuresOf(index: EntityIndex): Int32Array | undefined {
    return this.#entityFeatures[index];
  }

  /** Resolve a feature index to its display label. */
  describe(featureId: FeatureId): FeatureLabel | undefined {
    const info = this.#featureInfo[featureId];
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
  numericKeysOf(index: EntityIndex): Int32Array | undefined {
    return this.#entityNumericKeys[index];
  }

  /** Raw numeric values (numbers, or dates as epoch ms). */
  numericValuesOf(index: EntityIndex): Float64Array | undefined {
    return this.#entityNumericValues[index];
  }

  numericBaseUrl(keyId: NumericKeyId): string | undefined {
    return this.#numericKeyBaseUrl[keyId];
  }

  numericKind(keyId: NumericKeyId): NumericKind {
    return this.#numericKeyKind[keyId] ?? "number";
  }
}
