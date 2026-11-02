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

const renderDependentTypes = (
  mocks: MockedResponse[],
  entityTypeId: VersionedUrl | null = animalTypeId,
) =>
  renderHook(() => useDependentTypes(entityTypeId), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MockedProvider mocks={mocks} addTypename={false}>
        {children}
      </MockedProvider>
    ),
  });

describe("useDependentTypes", () => {
  it("returns the types the query finds", async () => {
    const { result } = renderDependentTypes([queryReturns([cat, dog])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Cat", "Dog"]);
    });
  });

  it("asks for every version of the types that directly extend Animal v1", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderDependentTypes([{ ...queryReturns([]), variableMatcher }]);

    await waitFor(() => {
      expect(variableMatcher).toHaveBeenCalledWith({
        request: {
          filter: {
            equal: [
              {
                path: ["inheritsFrom(inheritanceDepth=0)", "*", "versionedUrl"],
              },
              { parameter: animalTypeId },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
        },
      });
    });
  });

  it("leaves Animal out of its own children", async () => {
    const { result } = renderDependentTypes([queryReturns([animalV2, dog])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Dog"]);
    });
  });

  it("shows each type once, at its newest version that extends Animal v1", async () => {
    const { result } = renderDependentTypes([queryReturns([dogV2, dog])]);

    await waitFor(() => {
      expect(result.current.children?.map((child) => child.schema.$id)).toEqual(
        [dogV2.schema.$id],
      );
    });
  });

  it("sorts children by title", async () => {
    const { result } = renderDependentTypes([queryReturns([dog, cat])]);

    await waitFor(() => {
      expect(
        result.current.children?.map((child) => child.schema.title),
      ).toEqual(["Cat", "Dog"]);
    });
  });

  it("sends no query without a type", async () => {
    const variableMatcher = vi.fn().mockReturnValue(true);

    renderDependentTypes([{ ...queryReturns([dog]), variableMatcher }], null);

    await act(async () => {});

    expect(variableMatcher).not.toHaveBeenCalled();
  });

  it("reports a failed query", async () => {
    const { result } = renderDependentTypes([
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
