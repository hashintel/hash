// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { useDependentTypes } from "./use-dependent-types";

import type { MockedResponse } from "@apollo/client/testing";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ReactNode } from "react";

const animalBaseUrl =
  "https://example.com/@alice/types/entity-type/animal/" as BaseUrl;

const extendsAnimal = {
  equal: [
    { path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"] },
    { parameter: animalBaseUrl },
  ],
};

const allVersionsRequest = {
  request: {
    filter: extendsAnimal,
    temporalAxes: currentTimeInstantTemporalAxes,
  },
};

const latestVersionsRequest = {
  request: {
    filter: {
      all: [
        extendsAnimal,
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
  },
};

const makeEntityType = (title: string, version: number) =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: `https://example.com/@alice/types/entity-type/${title.toLowerCase()}/v/${version}` as VersionedUrl,
      title,
      type: "object",
      properties: {},
      allOf: [{ $ref: `${animalBaseUrl}v/1` as VersionedUrl }],
    },
  }) as unknown as EntityTypeWithMetadata;

const dogV1 = makeEntityType("Dog", 1);
const dogV2 = makeEntityType("Dog", 2);

const queryReturns = (
  variables: typeof allVersionsRequest | typeof latestVersionsRequest,
  entityTypes: EntityTypeWithMetadata[],
): MockedResponse => ({
  request: { query: queryEntityTypesQuery, variables },
  result: { data: { queryEntityTypes: { entityTypes } } },
});

const renderDependentTypes = (
  mocks: MockedResponse[],
  entityTypeBaseUrl: BaseUrl | null = animalBaseUrl,
) =>
  renderHook(() => useDependentTypes(entityTypeBaseUrl), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    ),
  });

describe("useDependentTypes", () => {
  it("asks for every version of each type that directly extends any version of Animal, and for each such type's latest version", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);
    const anyRequest: MockedResponse = {
      request: { query: queryEntityTypesQuery },
      variableMatcher,
      result: { data: { queryEntityTypes: { entityTypes: [] } } },
    };

    renderDependentTypes([anyRequest, anyRequest]);

    await waitFor(() => {
      expect(variableMatcher).toHaveBeenCalledWith(allVersionsRequest);
      expect(variableMatcher).toHaveBeenCalledWith(latestVersionsRequest);
    });
  });

  it("returns both results once both have arrived", async () => {
    const { result } = renderDependentTypes([
      queryReturns(allVersionsRequest, [dogV2, dogV1]),
      queryReturns(latestVersionsRequest, [dogV2]),
    ]);

    await waitFor(() => {
      expect(result.current.data).toEqual({
        allVersions: { entityTypes: [dogV2, dogV1] },
        latestVersions: { entityTypes: [dogV2] },
      });
    });
  });

  it("sends no query without a base URL", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderDependentTypes(
      [
        {
          request: { query: queryEntityTypesQuery },
          variableMatcher,
          result: { data: { queryEntityTypes: { entityTypes: [dogV1] } } },
        },
      ],
      null,
    );

    await act(async () => {});

    expect(variableMatcher).not.toHaveBeenCalled();
  });

  it("reports a failed query", async () => {
    const { result } = renderDependentTypes([
      queryReturns(allVersionsRequest, [dogV1]),
      {
        request: {
          query: queryEntityTypesQuery,
          variables: latestVersionsRequest,
        },
        error: new Error("Network down"),
      },
    ]);

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Network down");
    });
    expect(result.current.data).toBeUndefined();
  });
});
