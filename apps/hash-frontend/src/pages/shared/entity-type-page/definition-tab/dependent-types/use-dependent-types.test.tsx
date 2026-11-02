// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ENTITY_TYPE_META_SCHEMA } from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDependentEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
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

const queryReturns = (data: {
  allVersions: EntityTypeWithMetadata[];
  latestVersions: EntityTypeWithMetadata[];
}): MockedResponse => ({
  request: { query: queryDependentEntityTypesQuery },
  variableMatcher: () => true,
  result: {
    data: {
      allVersions: { entityTypes: data.allVersions },
      latestVersions: { entityTypes: data.latestVersions },
    },
  },
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
  it("asks in one request for every version of each type that directly extends any version of Animal, and for each such type's latest version", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderDependentTypes([
      {
        ...queryReturns({ allVersions: [], latestVersions: [] }),
        variableMatcher,
      },
    ]);

    const extendsAnimal = {
      equal: [
        { path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"] },
        { parameter: animalBaseUrl },
      ],
    };

    await waitFor(() => {
      expect(variableMatcher).toHaveBeenCalledWith({
        allVersions: {
          filter: extendsAnimal,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
        latestVersions: {
          filter: {
            all: [
              extendsAnimal,
              { equal: [{ path: ["version"] }, { parameter: "latest" }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      });
    });
  });

  it("returns both results", async () => {
    const { result } = renderDependentTypes([
      queryReturns({ allVersions: [dogV2, dogV1], latestVersions: [dogV2] }),
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
          ...queryReturns({ allVersions: [dogV1], latestVersions: [dogV1] }),
          variableMatcher,
        },
      ],
      null,
    );

    await act(async () => {});

    expect(variableMatcher).not.toHaveBeenCalled();
  });

  it("reports a failed query", async () => {
    const { result } = renderDependentTypes([
      {
        request: { query: queryDependentEntityTypesQuery },
        variableMatcher: () => true,
        error: new Error("Network down"),
      },
    ]);

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Network down");
    });
  });
});
