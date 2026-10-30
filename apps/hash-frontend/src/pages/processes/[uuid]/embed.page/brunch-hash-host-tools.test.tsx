// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { AuthInfoContext } from "../../../shared/auth-info-context";
import { useBrunchHashHostTools } from "./brunch-hash-graph-reads";

import type { User } from "../../../../lib/user-and-org";
import type { AuthInfoContextValue } from "../../../shared/auth-info-context";
import type { PetrinautAiAutomaticToolExecuteParams } from "@hashintel/brunch-agent/ui";
import type { ReactNode } from "react";

const apollo = vi.hoisted(() => ({
  query: vi.fn<(options: unknown) => Promise<unknown>>(),
}));

vi.mock("@apollo/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useApolloClient: () => apollo,
}));

const userWith = (shortname: string, orgs: string[]) =>
  ({
    accountId: `${shortname}-web`,
    shortname,
    displayName: shortname.toUpperCase(),
    memberOf: orgs.map((org) => ({
      org: { webId: `${org}-web`, shortname: org, name: org.toUpperCase() },
    })),
  }) as unknown as User;

const renderTools = (initialUser: User) => {
  let authenticatedUser = initialUser;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthInfoContext.Provider
      value={{ authenticatedUser } as unknown as AuthInfoContextValue}
    >
      {children}
    </AuthInfoContext.Provider>
  );
  const rendered = renderHook(() => useBrunchHashHostTools(), { wrapper });
  return {
    ...rendered,
    signIn: (user: User) => {
      authenticatedUser = user;
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
  const { result, signIn } = renderTools(userWith("alice", ["acme"]));
  const first = result.current;
  expect(first.map(({ toolName }) => toolName)).toEqual([
    brunchTools.queryHashEntities,
    brunchTools.queryHashEntityTypes,
    brunchTools.queryHashWebs,
  ]);
  await expect(execute(first, brunchTools.queryHashWebs, {})).resolves.toEqual({
    webs: [
      { webId: "alice-web", kind: "user", shortname: "alice", name: "ALICE" },
      {
        webId: "acme-web",
        kind: "organization",
        shortname: "acme",
        name: "ACME",
      },
    ],
  });

  signIn(userWith("alice", []));
  expect(result.current).toBe(first);
  await expect(execute(first, brunchTools.queryHashWebs, {})).resolves.toEqual({
    webs: [
      { webId: "alice-web", kind: "user", shortname: "alice", name: "ALICE" },
    ],
  });
});

test("the type read asks the page's Apollo client for the graph's types now, and a GraphQL failure settles its message", async () => {
  const { result } = renderTools(userWith("alice", []));
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
      webIds: ["alice-web"],
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
