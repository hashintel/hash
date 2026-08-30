// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ENTITY_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";

import { updateEntityTypesMutation } from "../../../graphql/queries/ontology/entity-type.queries";
import { useEntityTypeValue } from "./use-entity-type-value";

import type { MockedResponse } from "@apollo/client/testing";
import type { EntityTypeRootType, Subgraph } from "@blockprotocol/graph";
import type {
  BaseUrl,
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ConstructEntityTypeParams } from "@local/hash-graph-sdk/ontology";
import type { ReactNode } from "react";

const parentBaseUrl =
  "https://example.com/@alice/types/entity-type/animal/" as BaseUrl;
const parentTypeId = `${parentBaseUrl}v/1` as VersionedUrl;

const childBaseUrl =
  "https://example.com/@alice/types/entity-type/dog/" as BaseUrl;
const childTypeId = `${childBaseUrl}v/1` as VersionedUrl;

const namePropertyBaseUrl =
  "https://example.com/@alice/types/property-type/name/" as BaseUrl;

const makeEntityType = (
  baseUrl: BaseUrl,
  $id: VersionedUrl,
  title: string,
  extra: Partial<ConstructEntityTypeParams> = {},
): EntityTypeWithMetadata =>
  ({
    schema: {
      $schema: ENTITY_TYPE_META_SCHEMA,
      kind: "entityType",
      $id,
      title,
      description: `A ${title}`,
      type: "object",
      properties: {},
      ...extra,
    },
    metadata: {
      recordId: { baseUrl, version: makeOntologyTypeVersion({ major: 1 }) },
    },
  }) as EntityTypeWithMetadata;

const parentType = makeEntityType(parentBaseUrl, parentTypeId, "Animal");

const storedChildType = makeEntityType(childBaseUrl, childTypeId, "Dog", {
  allOf: [{ $ref: parentTypeId }],
  required: [namePropertyBaseUrl],
});

const subgraph = {
  roots: [],
  vertices: {
    [parentBaseUrl]: { "1": { kind: "entityType", inner: parentType } },
    [childBaseUrl]: { "1": { kind: "entityType", inner: storedChildType } },
  },
  edges: {},
} as unknown as Subgraph<EntityTypeRootType>;

vi.mock("next/router", () => ({
  useRouter: () => ({ replace: () => Promise.resolve(true) }),
}));

vi.mock("../../../shared/entity-types-context/hooks", () => ({
  useEntityTypesLoading: () => false,
  useEntityTypesSubgraphOptional: () => subgraph,
  useFetchEntityTypes: () => () => Promise.resolve(),
}));

const schemaWithout = (
  omitted: ("allOf" | "required")[],
): ConstructEntityTypeParams => {
  const schema: Record<string, unknown> = {
    $schema: ENTITY_TYPE_META_SCHEMA,
    kind: "entityType",
    title: "Dog",
    description: "A Dog",
    type: "object",
    properties: {},
    links: {},
    allOf: [{ $ref: parentTypeId }],
    required: [namePropertyBaseUrl],
  };

  for (const key of omitted) {
    delete schema[key];
  }

  return schema as unknown as ConstructEntityTypeParams;
};

/**
 * `convertToLinkType` passes the rewritten schema without removing `$id`,
 * where the save handler destructures it out. `rewriteSchemasToNextVersion`
 * leaves `$id` on the version it was given.
 */
const schemaWithId = (): ConstructEntityTypeParams =>
  ({
    ...schemaWithout([]),
    $id: childTypeId,
  }) as unknown as ConstructEntityTypeParams;

const renderUpdateCallback = () => {
  const variableMatcher = vi.fn().mockReturnValue(true);

  const mocks: MockedResponse[] = [
    {
      request: { query: updateEntityTypesMutation },
      variableMatcher,
      result: { data: { updateEntityTypes: [] } },
    },
  ];

  const wrapper = ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  );

  const rendered = renderHook(
    () => useEntityTypeValue(childBaseUrl, null, null),
    { wrapper },
  );

  return { ...rendered, variableMatcher };
};

const primaryUpdateFrom = (variableMatcher: ReturnType<typeof vi.fn>) => {
  const variables = variableMatcher.mock.calls[0]?.[0] as {
    updates: {
      entityTypeId: VersionedUrl;
      updatedEntityType: Record<string, unknown>;
    }[];
  };

  return variables.updates[0]!;
};

describe("useEntityTypeValue update payload $id", () => {
  it("carries no $id when the caller removed it, as the save handler does", async () => {
    const { result, variableMatcher } = renderUpdateCallback();

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });

    const [, , , updateEntityType] = result.current;

    await act(async () => {
      await updateEntityType(schemaWithout([]), []);
    });

    const primaryUpdate = primaryUpdateFrom(variableMatcher);

    expect(primaryUpdate.updatedEntityType).not.toHaveProperty("$id");
  });

  it("carries $id when the caller left it on, as convertToLinkType does", async () => {
    const { result, variableMatcher } = renderUpdateCallback();

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });

    const [, , , updateEntityType] = result.current;

    await act(async () => {
      await updateEntityType(schemaWithId(), []);
    });

    const primaryUpdate = primaryUpdateFrom(variableMatcher);

    expect(primaryUpdate.updatedEntityType.$id).toBe(childTypeId);
  });
});

describe("useEntityTypeValue update", () => {
  it("sends the schema it is given rather than falling back to the stored one", async () => {
    const { result, variableMatcher } = renderUpdateCallback();

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });

    const [, , , updateEntityType] = result.current;

    /**
     * The editor omits `allOf` and `required` once the user has removed the
     * type's only parent and unchecked its only required property, because an
     * empty list is expressed by the key's absence.
     */
    await act(async () => {
      await updateEntityType(schemaWithout(["allOf", "required"]), []);
    });

    const primaryUpdate = primaryUpdateFrom(variableMatcher);

    expect(primaryUpdate.entityTypeId).toBe(childTypeId);
    expect(primaryUpdate.updatedEntityType).not.toHaveProperty("allOf");
    expect(primaryUpdate.updatedEntityType).not.toHaveProperty("required");
  });

  it("sends a parent list and a required list when the schema has them", async () => {
    const { result, variableMatcher } = renderUpdateCallback();

    await waitFor(() => {
      expect(result.current[0]).not.toBeNull();
    });

    const [, , , updateEntityType] = result.current;

    await act(async () => {
      await updateEntityType(schemaWithout([]), []);
    });

    const primaryUpdate = primaryUpdateFrom(variableMatcher);

    expect(primaryUpdate.updatedEntityType.allOf).toEqual([
      { $ref: parentTypeId },
    ]);
    expect(primaryUpdate.updatedEntityType.required).toEqual([
      namePropertyBaseUrl,
    ]);
  });
});
