import { describe, expect, it, vi } from "vitest";

import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryAllPropertyTypes } from "./query-all-property-types";

import type { QueryPropertyTypesQuery } from "../../../graphql/api-types.gen";
import type { PropertyTypeWithMetadata } from "@blockprotocol/type-system";

const property = (title: string, version = 1) =>
  ({
    schema: {
      $id: `https://example.com/@h/types/property-type/${title}/v/${version}`,
      title,
    },
  }) as PropertyTypeWithMetadata;
const request = {
  filter: { all: [] },
  temporalAxes: fullTransactionTimeAxis,
  limit: 1000,
};

describe("property type catalogue pagination", () => {
  it("retains all versions across pages, including a short page with a cursor", async () => {
    const old = property("length");
    const latest = property("length", 2);
    const width = property("width");
    const query = vi
      .fn<Parameters<typeof queryAllPropertyTypes>[0]>()
      .mockResolvedValueOnce({
        propertyTypes: [old],
        cursor: old.schema.$id,
      })
      .mockResolvedValueOnce({
        propertyTypes: [latest],
        cursor: latest.schema.$id,
      })
      .mockResolvedValueOnce({ propertyTypes: [width] });
    const result = await queryAllPropertyTypes(query, request);
    expect(Object.values(result)).toEqual([old, latest, width]);
    expect(query).toHaveBeenNthCalledWith(2, {
      ...request,
      after: old.schema.$id,
    });
    expect(query).toHaveBeenNthCalledWith(3, {
      ...request,
      after: latest.schema.$id,
    });
  });

  it("rejects a later-page failure without returning a partial catalogue", async () => {
    const first = property("length");
    const query = vi
      .fn<Parameters<typeof queryAllPropertyTypes>[0]>()
      .mockResolvedValueOnce({
        propertyTypes: [first],
        cursor: first.schema.$id,
      })
      .mockRejectedValueOnce(new Error("Later page failed"));
    await expect(queryAllPropertyTypes(query, request)).rejects.toThrow(
      "Later page failed",
    );
  });

  it("stops repeated cursors instead of requesting pages indefinitely", async () => {
    const first = property("length");
    const page: QueryPropertyTypesQuery["queryPropertyTypes"] = {
      propertyTypes: [first],
      cursor: first.schema.$id,
    };
    const query = vi.fn().mockResolvedValue(page);
    await expect(queryAllPropertyTypes(query, request)).rejects.toThrow(
      "repeated cursor",
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
