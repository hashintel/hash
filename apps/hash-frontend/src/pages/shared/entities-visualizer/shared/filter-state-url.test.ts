import { describe, expect, it } from "vitest";

import { createDefaultFilterState } from "./filter-state";
import {
  applyFilterValuesToAsPath,
  parseFilterStateFromQuery,
  serializeFilterStateToQuery,
} from "./filter-state-url";

import type { EntitiesFilterState } from "./filter-state";
import type { BaseUrl, VersionedUrl, WebId } from "@blockprotocol/type-system";

const webA = "11111111-1111-4111-8111-111111111111" as WebId;
const webB = "22222222-2222-4222-8222-222222222222" as WebId;
const internalWebIds = [webA, webB];

const personType =
  "https://hash.ai/@hash/types/entity-type/person/v/1" as VersionedUrl;
const orgType =
  "https://hash.ai/@hash/types/entity-type/organization/v/1" as VersionedUrl;
const unitOfMeasureBaseUrl =
  "https://hash.ai/@hash/types/property-type/unit-of-measure/" as BaseUrl;

const roundTrip = (
  state: EntitiesFilterState,
  isTypePinned = false,
): EntitiesFilterState =>
  parseFilterStateFromQuery({
    query: serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned,
    }),
    internalWebIds,
    isTypePinned,
  });

describe("filter-state-url", () => {
  it("serializes the default state to an empty query", () => {
    expect(
      serializeFilterStateToQuery({
        filterState: createDefaultFilterState(internalWebIds),
        internalWebIds,
        isTypePinned: false,
      }),
    ).toEqual({});
  });

  it("parses an empty query to the default state", () => {
    expect(
      parseFilterStateFromQuery({
        query: {},
        internalWebIds,
        isTypePinned: false,
      }),
    ).toEqual(createDefaultFilterState(internalWebIds));
  });

  it("round-trips a single selected web", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.web.selectedInternalWebIds = new Set([webA]);

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ webs: webA });
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips 'any' (all internal + other webs)", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.web.includeOtherWebs = true;

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ otherWebs: "true" });
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips 'none' (no internal webs selected)", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.web.selectedInternalWebIds = new Set();

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ webs: "none" });
    expect(roundTrip(state)).toEqual(state);
  });

  it("serializes types as a comma-separated list and round-trips", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.type.selectedTypeIds = new Set([personType, orgType]);

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ types: `${personType},${orgType}` });
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips empty type selection", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.type.selectedTypeIds = new Set();

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ types: "none" });
    expect(roundTrip(state)).toEqual(state);
  });

  it("ignores the type dimension when pinned", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.type.selectedTypeIds = new Set([personType]);

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: true,
    });
    expect(values).toEqual({});

    const parsed = roundTrip(state, true);
    expect(parsed.type.selectedTypeIds).toBeNull();
  });

  it("round-trips includeArchived", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.includeArchived = true;

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({ archived: "true" });
    expect(roundTrip(state)).toEqual(state);
  });

  it("serializes property filters compactly and re-derives the title from the slug", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.propertyFilters = [
      {
        id: "ignored-on-serialize",
        baseUrl: unitOfMeasureBaseUrl,
        title: "Unit of Measure",
        kind: "string",
        operator: "equals",
        value: "2",
      },
    ];

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({
      propertyFilter: [`${unitOfMeasureBaseUrl};string;equals;2`],
    });

    const parsed = roundTrip(state);
    expect(parsed.propertyFilters).toHaveLength(1);
    const [filter] = parsed.propertyFilters;
    expect(filter).toMatchObject({
      baseUrl: unitOfMeasureBaseUrl,
      kind: "string",
      operator: "equals",
      value: "2",
      // Title is dropped from the URL and re-derived from the slug.
      title: "Unit Of Measure",
    });
    expect(filter!.id).not.toBe("ignored-on-serialize");
  });

  it("preserves field separators that appear inside a property filter value", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.propertyFilters = [
      {
        id: "x",
        baseUrl: unitOfMeasureBaseUrl,
        title: "Unit of Measure",
        kind: "string",
        operator: "contains",
        value: "a;b;c",
      },
    ];

    const parsed = roundTrip(state);
    expect(parsed.propertyFilters[0]).toMatchObject({ value: "a;b;c" });
  });

  it("omits the value for value-less property filter operators", () => {
    const state = createDefaultFilterState(internalWebIds);
    state.propertyFilters = [
      {
        id: "x",
        baseUrl: unitOfMeasureBaseUrl,
        title: "Unit of Measure",
        kind: "string",
        operator: "isEmpty",
      },
    ];

    const values = serializeFilterStateToQuery({
      filterState: state,
      internalWebIds,
      isTypePinned: false,
    });
    expect(values).toEqual({
      propertyFilter: [`${unitOfMeasureBaseUrl};string;isEmpty`],
    });

    const parsed = roundTrip(state);
    expect(parsed.propertyFilters[0]).toMatchObject({
      operator: "isEmpty",
      value: undefined,
    });
  });

  it("drops malformed property filters on parse", () => {
    const parsed = parseFilterStateFromQuery({
      query: {
        propertyFilter: [
          "not-a-url;number;equals;1",
          `${unitOfMeasureBaseUrl};number;notAnOperator`,
          `${unitOfMeasureBaseUrl};string;equals;5`,
        ],
      },
      internalWebIds,
      isTypePinned: false,
    });
    expect(parsed.propertyFilters).toHaveLength(1);
    expect(parsed.propertyFilters[0]).toMatchObject({ value: "5" });
  });

  it("filters out web ids that are not internal", () => {
    const parsed = parseFilterStateFromQuery({
      query: { webs: `${webA},99999999-9999-4999-8999-999999999999` },
      internalWebIds,
      isTypePinned: false,
    });
    expect([...parsed.web.selectedInternalWebIds]).toEqual([webA]);
  });

  describe("applyFilterValuesToAsPath", () => {
    it("keeps type URLs human-readable (no percent-encoded slashes/colons)", () => {
      const { nextAsPath } = applyFilterValuesToAsPath({
        asPath: "/entities",
        filterValues: { types: personType },
      });
      expect(nextAsPath).toBe(`/entities?types=${personType}`);
      expect(nextAsPath).not.toContain("%3A");
      expect(nextAsPath).not.toContain("%2F");
    });

    it("adds filter params while preserving existing ones", () => {
      const { changed, nextAsPath } = applyFilterValuesToAsPath({
        asPath: "/entities?entityTypeIdOrBaseUrl=foo",
        filterValues: { webs: webA, archived: "true" },
      });
      expect(changed).toBe(true);
      expect(nextAsPath).toBe(
        `/entities?entityTypeIdOrBaseUrl=foo&webs=${webA}&archived=true`,
      );
    });

    it("reports no change when the params already match", () => {
      const { changed } = applyFilterValuesToAsPath({
        asPath: `/entities?archived=true`,
        filterValues: { archived: "true" },
      });
      expect(changed).toBe(false);
    });

    it("removes filter params that are no longer present", () => {
      const { changed, nextAsPath } = applyFilterValuesToAsPath({
        asPath: `/entities?webs=${webA}&archived=true`,
        filterValues: { webs: webA },
      });
      expect(changed).toBe(true);
      expect(nextAsPath).toBe(`/entities?webs=${webA}`);
    });

    it("emits one repeated parameter per property filter", () => {
      const { nextAsPath } = applyFilterValuesToAsPath({
        asPath: "/entities",
        filterValues: {
          propertyFilter: [
            `${unitOfMeasureBaseUrl};string;equals;2`,
            `${unitOfMeasureBaseUrl};string;contains;x`,
          ],
        },
      });
      expect(nextAsPath).toBe(
        `/entities?propertyFilter=${unitOfMeasureBaseUrl};string;equals;2` +
          `&propertyFilter=${unitOfMeasureBaseUrl};string;contains;x`,
      );
    });

    it("encodes spaces in values as %20 (not +) while keeping separators raw", () => {
      const { nextAsPath } = applyFilterValuesToAsPath({
        asPath: "/entities",
        filterValues: {
          propertyFilter: [`${unitOfMeasureBaseUrl};string;equals;John Doe`],
        },
      });
      expect(nextAsPath).toContain("%20");
      expect(nextAsPath).not.toContain("+");
      expect(nextAsPath).toContain(`${unitOfMeasureBaseUrl};string;equals;`);
    });
  });
});
