// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ENTITY_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { useEntityTypeChildren } from "./use-entity-type-children";

import type { MockedResponse } from "@apollo/client/testing";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ReactNode } from "react";

const animalBaseUrl =
  "https://example.com/@alice/types/entity-type/animal/" as BaseUrl;
const animalTypeId = `${animalBaseUrl}v/1` as VersionedUrl;

const makeEntityType = (
  baseUrl: BaseUrl,
  title: string,
  version = 1,
): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id: `${baseUrl}v/${version}` as VersionedUrl,
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
      allOf: [{ $ref: animalTypeId }],
    },
    metadata: {
      recordId: {
        baseUrl,
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as unknown as EntityTypeWithMetadata;

const animalV2 = makeEntityType(animalBaseUrl, "Animal", 2);

const cat = makeEntityType(
  "https://example.com/@alice/types/entity-type/cat/" as BaseUrl,
  "Cat",
);
const dogBaseUrl =
  "https://example.com/@alice/types/entity-type/dog/" as BaseUrl;
const dog = makeEntityType(dogBaseUrl, "Dog");
const dogV2 = makeEntityType(dogBaseUrl, "Dog", 2);

const queryReturns = (
  entityTypes: EntityTypeWithMetadata[],
): MockedResponse => ({
  request: { query: queryEntityTypesQuery },
  variableMatcher: () => true,
  result: { data: { queryEntityTypes: { entityTypes } } },
});

const renderEntityTypeChildren = (
  mocks: MockedResponse[],
  entityTypeBaseUrl: BaseUrl | null = animalBaseUrl,
) =>
  renderHook(() => useEntityTypeChildren(entityTypeBaseUrl), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    ),
  });

describe("useEntityTypeChildren", () => {
  it("returns the types the query finds", async () => {
    const { result } = renderEntityTypeChildren([queryReturns([cat, dog])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Cat", "Dog"]);
    });
  });

  it("asks only for the latest version of each type that directly extends Animal", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderEntityTypeChildren([{ ...queryReturns([]), variableMatcher }]);

    await waitFor(() => {
      expect(variableMatcher).toHaveBeenCalledWith({
        request: {
          filter: {
            all: [
              {
                equal: [
                  {
                    path: ["inheritsFrom(inheritanceDepth=0)", "*", "baseUrl"],
                  },
                  { parameter: animalBaseUrl },
                ],
              },
              { equal: [{ path: ["version"] }, { parameter: "latest" }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      });
    });
  });

  it("leaves Animal out of its own children", async () => {
    const { result } = renderEntityTypeChildren([
      queryReturns([animalV2, dog]),
    ]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Dog"]);
    });
  });

  it("lists each type once", async () => {
    const { result } = renderEntityTypeChildren([queryReturns([dog, dogV2])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Dog"]);
    });
  });

  it("sorts children by title", async () => {
    const { result } = renderEntityTypeChildren([queryReturns([dog, cat])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Cat", "Dog"]);
    });
  });

  it("sends no query without a base URL", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderEntityTypeChildren(
      [{ ...queryReturns([dog]), variableMatcher }],
      null,
    );

    await act(async () => {});

    expect(variableMatcher).not.toHaveBeenCalled();
  });

  it("reports a failed query", async () => {
    const { result } = renderEntityTypeChildren([
      {
        request: { query: queryEntityTypesQuery },
        variableMatcher: () => true,
        error: new Error("Network down"),
      },
    ]);

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Network down");
    });
  });
});
