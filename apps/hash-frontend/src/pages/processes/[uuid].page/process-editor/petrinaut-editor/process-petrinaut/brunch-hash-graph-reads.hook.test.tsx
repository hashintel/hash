// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { summarizeEntitiesQuery } from "../../../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../../../graphql/queries/ontology/entity-type.queries";
import {
  type HashWebReadUser,
  useBrunchHashGraphReadTools,
} from "./brunch-hash-graph-reads";

import type { PetrinautAiAutomaticToolExecuteParams } from "@hashintel/brunch-agent/ui";

const apollo = vi.hoisted(() => ({
  query: vi.fn<(options: unknown) => Promise<unknown>>(),
}));

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useApolloClient: () => apollo,
}));

/** The page's auth info, as much of it as the reads use. */
const auth = vi.hoisted((): { authenticatedUser?: HashWebReadUser } => ({}));

vi.mock("../../../../../shared/auth-info-context", () => ({
  useAuthInfo: () => auth,
}));

const userWith = (shortname: string, orgs: string[]): HashWebReadUser => ({
  accountId: `${shortname}-web` as HashWebReadUser["accountId"],
  shortname,
  displayName: shortname.toUpperCase(),
  memberOf: orgs.map((org) => ({
    org: {
      webId:
        `${org}-web` as HashWebReadUser["memberOf"][number]["org"]["webId"],
      shortname: org,
      name: org.toUpperCase(),
    },
  })),
});

const renderTools = (initialUser: HashWebReadUser) => {
  auth.authenticatedUser = initialUser;
  const rendered = renderHook(() => useBrunchHashGraphReadTools());
  return {
    ...rendered,
    signIn: (user: HashWebReadUser) => {
      auth.authenticatedUser = user;
      rendered.rerender();
    },
  };
};

const execute = (
  tools: ReturnType<typeof useBrunchHashGraphReadTools>,
  toolName: string,
  input: unknown,
) =>
  Promise.resolve().then(() =>
    tools
      .find((tool) => tool.toolName === toolName)
      ?.execute({
        input,
        toolCallId: "read",
        signal: new AbortController().signal,
      } as PetrinautAiAutomaticToolExecuteParams),
  );

test("the page gives Brunch all four HASH reads, and keeps the list while the user is refetched", async () => {
  const { result, signIn } = renderTools(userWith("member", ["acme"]));
  const first = result.current;
  expect(first.map(({ toolName }) => toolName)).toEqual([
    brunchTools.hashQueryEntities,
    brunchTools.hashQueryEntityTypes,
    brunchTools.hashQueryWebs,
    brunchTools.hashCountEntities,
  ]);
  await expect(execute(first, brunchTools.hashQueryWebs, {})).resolves.toEqual({
    webs: [
      {
        webId: "member-web",
        kind: "user",
        shortname: "member",
        name: "MEMBER",
      },
      {
        webId: "acme-web",
        kind: "organization",
        shortname: "acme",
        name: "ACME",
      },
    ],
  });

  signIn(userWith("member", []));
  expect(result.current).toBe(first);
  await expect(execute(first, brunchTools.hashQueryWebs, {})).resolves.toEqual({
    webs: [
      {
        webId: "member-web",
        kind: "user",
        shortname: "member",
        name: "MEMBER",
      },
    ],
  });
});

test("the type read asks the page's Apollo client for the graph's types now, and a GraphQL failure settles its message", async () => {
  const { result } = renderTools(userWith("member", []));
  apollo.query.mockResolvedValueOnce({
    data: {
      queryEntityTypes: {
        entityTypes: [],
        closedEntityTypes: [],
        definitions: { dataTypes: {}, propertyTypes: {}, entityTypes: {} },
      },
    },
  });
  await expect(
    execute(result.current, brunchTools.hashQueryEntityTypes, {
      webIds: ["member-web"],
    }),
  ).resolves.toEqual({ entityTypes: [] });
  expect(apollo.query).toHaveBeenCalledWith(
    expect.objectContaining({
      query: queryEntityTypesQuery,
      fetchPolicy: "network-only",
    }),
  );

  apollo.query.mockRejectedValueOnce(
    new Error("Response not successful: Received status code 500"),
  );
  await expect(
    execute(result.current, brunchTools.hashQueryEntityTypes, {}),
  ).resolves.toEqual({
    error: "Response not successful: Received status code 500",
  });
});

test("the count asks the page's Apollo client for a summary now, in the webs of the user signed in when it runs", async () => {
  const { result, signIn } = renderTools(userWith("member", ["acme"]));
  signIn(userWith("member", []));
  apollo.query.mockResolvedValueOnce({
    data: { summarizeEntities: { count: 2, typeIds: {}, webIds: {} } },
  });
  await expect(
    execute(result.current, brunchTools.hashCountEntities, {}),
  ).resolves.toMatchObject({
    count: 2,
    webScope: "default",
    webs: [{ webId: "member-web", count: 0 }],
  });
  expect(apollo.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      query: summarizeEntitiesQuery,
      fetchPolicy: "network-only",
      variables: {
        request: expect.objectContaining({
          filter: expect.objectContaining({
            all: expect.arrayContaining([
              {
                any: [
                  { equal: [{ path: ["webId"] }, { parameter: "member-web" }] },
                ],
              },
            ]),
          }),
        }),
      },
    }),
  );
});

test("the entity read asks the page's Apollo client for entities in the webs of the user signed in when it runs, and marks others external", async () => {
  const { result, signIn } = renderTools(userWith("member", ["acme"]));
  signIn(userWith("member", []));
  apollo.query.mockResolvedValueOnce({
    data: {
      queryEntitySubgraph: {
        subgraph: {
          roots: [],
          vertices: Object.fromEntries(
            ["member-web~own", "acme-web~former"].map((entityId) => [
              entityId,
              {
                "2026-10-26T00:00:00Z": {
                  kind: "entity",
                  inner: {
                    metadata: {
                      recordId: { entityId, editionId: `${entityId}-1` },
                      entityTypeIds: [
                        "https://hash.ai/@h/types/entity-type/thing/v/1",
                      ],
                    },
                    properties: {},
                  },
                },
              },
            ]),
          ),
          edges: {},
          temporalAxes: {},
        },
        closedMultiEntityTypes: {},
        definitions: { dataTypes: {}, propertyTypes: {}, entityTypes: {} },
      },
    },
  });
  const output = await execute(result.current, brunchTools.hashQueryEntities, {
    traversalDepth: 0,
  });
  expect(output).toMatchObject({
    entities: [
      { entityId: "member-web~own" },
      { entityId: "acme-web~former", external: true },
    ],
  });
  expect(output).not.toHaveProperty(["entities", 0, "external"]);
  expect(apollo.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      fetchPolicy: "network-only",
      variables: {
        request: expect.objectContaining({
          filter: expect.objectContaining({
            all: expect.arrayContaining([
              {
                any: [
                  { equal: [{ path: ["webId"] }, { parameter: "member-web" }] },
                ],
              },
            ]),
          }),
        }),
      },
    }),
  );
});
