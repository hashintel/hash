// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { queryEntityTypesQuery } from "../../../../../../graphql/queries/ontology/entity-type.queries";
import {
  type HashWebReadUser,
  useBrunchHashHostTools,
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
  const rendered = renderHook(() => useBrunchHashHostTools());
  return {
    ...rendered,
    signIn: (user: HashWebReadUser) => {
      auth.authenticatedUser = user;
      rendered.rerender();
    },
  };
};

const execute = (
  tools: ReturnType<typeof useBrunchHashHostTools>,
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

test("the page gives Brunch all three HASH reads, and keeps the list while the user is refetched", async () => {
  const { result, signIn } = renderTools(userWith("member", ["acme"]));
  const first = result.current;
  expect(first.map(({ toolName }) => toolName)).toEqual([
    brunchTools.queryHashEntities,
    brunchTools.queryHashEntityTypes,
    brunchTools.queryHashWebs,
  ]);
  await expect(execute(first, brunchTools.queryHashWebs, {})).resolves.toEqual({
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
  await expect(execute(first, brunchTools.queryHashWebs, {})).resolves.toEqual({
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
    execute(result.current, brunchTools.queryHashEntityTypes, {
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
    execute(result.current, brunchTools.queryHashEntityTypes, {}),
  ).resolves.toEqual({
    error: "Response not successful: Received status code 500",
  });
});
