import { describe, expect, it } from "vitest";

import {
  parseFilterConfigFile,
  serializeFilterConfigFile,
} from "./filter-config-file";

import type { EntityId } from "@blockprotocol/type-system";

const entityA =
  "11111111-1111-4111-8111-111111111111~aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as EntityId;
const entityB =
  "22222222-2222-4222-8222-222222222222~bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId;

describe("filter-config-file", () => {
  it("round-trips filters and expanded entity ids", () => {
    const config = {
      filters: {
        webs: "11111111-1111-4111-8111-111111111111",
        archived: "true",
        propertyFilter: [
          "https://hash.ai/@hash/types/property-type/age/;number;greaterThan;13",
        ],
      },
      expandedEntityIds: [entityA, entityB],
    };

    expect(parseFilterConfigFile(serializeFilterConfigFile(config))).toEqual(
      config,
    );
  });

  it("round-trips an empty configuration", () => {
    const config = { filters: {}, expandedEntityIds: [] };

    expect(parseFilterConfigFile(serializeFilterConfigFile(config))).toEqual(
      config,
    );
  });

  it("rejects malformed JSON", () => {
    expect(parseFilterConfigFile("{ not json")).toBeNull();
  });

  it("rejects JSON that is not a filter export", () => {
    expect(parseFilterConfigFile(JSON.stringify({ nodes: [] }))).toBeNull();
  });

  it("rejects a future format version", () => {
    expect(
      parseFilterConfigFile(
        JSON.stringify({
          format: "hash-entities-filters",
          version: 2,
          filters: {},
          expandedEntities: [],
        }),
      ),
    ).toBeNull();
  });

  it("drops unknown filter keys and malformed entity ids", () => {
    const parsed = parseFilterConfigFile(
      JSON.stringify({
        format: "hash-entities-filters",
        version: 1,
        filters: { archived: "true", rogueKey: "value", types: 42 },
        expandedEntities: [entityA, "not-an-entity-id", 7],
      }),
    );

    expect(parsed).toEqual({
      filters: { archived: "true" },
      expandedEntityIds: [entityA],
    });
  });
});
