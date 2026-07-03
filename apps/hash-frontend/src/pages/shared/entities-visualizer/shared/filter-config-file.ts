/**
 * File-based persistence for the entities view's filter configuration: the
 * filter state plus the entities graph exploration OR-ed into the set.
 *
 * A file, not the URL, because the expansion ids cannot ride the URL: each
 * entity id is ~70 characters, so a modest exploration blows past the URL
 * lengths browsers and servers reliably accept. Filter state alone stays in
 * the URL (it is compact); this file carries the complete configuration for
 * sharing and archiving.
 *
 * The filter payload reuses the URL-grade serialization
 * (`serializeFilterStateToQuery` / `parseFilterStateFromQuery` in
 * `filter-state-url.ts`), so a file round-trips through exactly the
 * validation the URL parameters get, and the two representations cannot
 * drift. The format is versioned; {@link parseFilterConfigFile} rejects
 * unknown versions rather than guessing.
 */
import { isEntityId } from "@blockprotocol/type-system";

import { filterStateQueryKeys } from "./filter-state-url";

import type { EntityId } from "@blockprotocol/type-system";

/** Distinguishes this file from arbitrary JSON the user might pick. */
const FILTER_CONFIG_FORMAT = "hash-entities-filters";
const FILTER_CONFIG_VERSION = 1;

export interface FilterConfig {
  /**
   * The filter state in its URL-parameter serialization (see
   * `serializeFilterStateToQuery` in `filter-state-url.ts`), restricted to
   * the keys the filter state owns.
   */
  filters: Record<string, string | string[]>;
  /** The entities expanded in the graph view ("OR n entities"). */
  expandedEntityIds: EntityId[];
}

const isQueryValue = (value: unknown): value is string | string[] =>
  typeof value === "string" ||
  (Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string"));

/** Serializes the configuration to the versioned file payload. */
export const serializeFilterConfigFile = ({
  filters,
  expandedEntityIds,
}: FilterConfig): string =>
  JSON.stringify(
    {
      format: FILTER_CONFIG_FORMAT,
      version: FILTER_CONFIG_VERSION,
      filters,
      expandedEntities: expandedEntityIds,
    },
    null,
    2,
  );

/**
 * Parses a filter-configuration file, returning `null` for anything that is
 * not a well-formed file of a known version (malformed JSON, another format,
 * a future version). Within a well-formed file, unknown filter keys and
 * malformed entity ids are dropped rather than failing the whole import;
 * the surviving filter values still pass through `parseFilterStateFromQuery`,
 * which falls back to defaults for anything malformed at the value level.
 */
export const parseFilterConfigFile = (raw: string): FilterConfig | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("format" in parsed) ||
    parsed.format !== FILTER_CONFIG_FORMAT ||
    !("version" in parsed) ||
    parsed.version !== FILTER_CONFIG_VERSION
  ) {
    return null;
  }

  const filters: Record<string, string | string[]> = {};
  if ("filters" in parsed && typeof parsed.filters === "object") {
    const rawFilters = parsed.filters as Record<string, unknown>;
    for (const key of filterStateQueryKeys) {
      const value = rawFilters[key];
      if (isQueryValue(value)) {
        filters[key] = value;
      }
    }
  }

  const rawExpanded =
    "expandedEntities" in parsed && Array.isArray(parsed.expandedEntities)
      ? parsed.expandedEntities
      : [];
  const expandedEntityIds = rawExpanded.filter(
    (id): id is EntityId => typeof id === "string" && isEntityId(id),
  );

  return { filters, expandedEntityIds };
};

/** Triggers a browser download of the configuration; returns the filename. */
export const downloadFilterConfigFile = (config: FilterConfig): string => {
  const blob = new Blob([serializeFilterConfigFile(config)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hash-filters-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return anchor.download;
};
