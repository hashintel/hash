import { describe, expect, it } from "vitest";

import { getPropertyColumns, groupByType } from "./entity-groups";

import type {
  BaseUrl,
  ClosedMultiEntityType,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

const supplier = "https://hash.ai/@acme/types/entity-type/supplier/v/1";
const distributor = "https://hash.ai/@acme/types/entity-type/distributor/v/2";
const name = "https://hash.ai/@acme/types/property-type/name/" as BaseUrl;
const region = "https://hash.ai/@acme/types/property-type/region/" as BaseUrl;
const tier = "https://hash.ai/@acme/types/property-type/tier/" as BaseUrl;

const entity = (
  entityTypeIds: string[],
  properties: Record<string, unknown> = {},
): HashEntity =>
  ({ metadata: { entityTypeIds }, properties }) as unknown as HashEntity;

describe("groupByType", () => {
  it("groups a list's entities by type, in the order each type first appears, keeping the list's order in each", () => {
    expect(
      groupByType([
        entity([distributor]),
        entity([supplier]),
        entity([distributor]),
        entity([supplier]),
        entity([supplier]),
      ]),
    ).toEqual([
      { key: distributor, entityTypeIds: [distributor], indexes: [0, 2] },
      { key: supplier, entityTypeIds: [supplier], indexes: [1, 3, 4] },
    ]);
  });

  it("groups an entity of two types with others of both, in either order, not with either type's", () => {
    const groups = groupByType([
      entity([supplier, distributor]),
      entity([supplier]),
      entity([distributor, supplier]),
    ]);

    expect(groups.map(({ indexes }) => indexes)).toEqual([[0, 2], [1]]);
  });

  it("puts the entities that couldn't be loaded last, whatever their place in the list", () => {
    expect(
      groupByType([undefined, entity([supplier]), undefined]).map(
        ({ entityTypeIds, indexes }) => ({ entityTypeIds, indexes }),
      ),
    ).toEqual([
      { entityTypeIds: [supplier], indexes: [1] },
      { entityTypeIds: null, indexes: [0, 2] },
    ]);
  });
});

describe("getPropertyColumns", () => {
  const closedType = {
    properties: {
      [name]: { $ref: `${name}v/1` },
      [region]: { $ref: `${region}v/3` },
      [tier]: { type: "array", items: { $ref: `${tier}v/1` } },
    },
  } as unknown as ClosedMultiEntityType;
  const definitions = {
    propertyTypes: {
      [`${name}v/1`]: { title: "Name" },
      [`${region}v/3`]: { title: "Region" },
      [`${tier}v/1`]: { title: "Tier" },
    },
  } as unknown as ClosedMultiEntityTypesDefinitions;

  it("has a column for each of the type's properties that any of the entities has, in the type's order", () => {
    expect(
      getPropertyColumns(closedType, definitions, [
        entity([supplier], { [tier]: ["A"] }),
        entity([supplier], { [tier]: ["B"], [name]: "Kestrel Seals" }),
      ]),
    ).toEqual([
      { baseUrl: name, title: "Name" },
      { baseUrl: tier, title: "Tier" },
    ]);
  });

  it("names a column by its property type's version the type uses", () => {
    expect(
      getPropertyColumns(
        closedType,
        {
          propertyTypes: {
            [`${region}v/2`]: { title: "Old region" },
            [`${region}v/3`]: { title: "Region" },
          },
        } as unknown as ClosedMultiEntityTypesDefinitions,
        [entity([supplier], { [region]: "North" })],
      ),
    ).toEqual([{ baseUrl: region, title: "Region" }]);
  });
});
