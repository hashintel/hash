// @vitest-environment jsdom
import { ApolloLink, Observable } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing";
import { Box } from "@mui/material";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SnackbarProvider } from "notistack";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";

import { useDataTypesContext } from "../shared/data-types-context";
import { DataTypesContextProvider } from "../shared/data-types-context-provider";
import ProfilePage from "./[shortname].page";
import { ProfilePageContent } from "./[shortname].page/profile-page-content";

import type { QueryDataTypesQuery } from "../../graphql/api-types.gen";
import type { Operation } from "@apollo/client";
import type { DataTypeWithMetadata } from "@blockprotocol/type-system";
import type { ReactNode } from "react";

const profile = vi.hoisted(() => ({
  kind: "user",
  accountId: "profile-web",
  shortname: "profile",
  pinnedEntityTypeBaseUrls: [],
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, asPath: "/@profile/types" }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("../../shared/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => (
    <Box component="button" onClick={onClick}>
      {children}
    </Box>
  ),
}));
vi.mock("../../lib/user-and-org", () => ({
  constructUser: () => profile,
  constructOrg: () => profile,
  isEntityUserEntity: () => true,
}));
vi.mock("../../shared/use-user-or-org", () => ({
  useUserOrOrg: () => ({
    canUserEdit: true,
    userOrOrg: {},
    userOrOrgSubgraph: {},
    loading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../shared/entity-types-context/hooks", () => ({
  useLatestEntityTypesOptional: () => ({ latestEntityTypes: undefined }),
}));
vi.mock("../../shared/layout", () => ({ getLayoutWithSidebar: () => null }));
vi.mock("../shared/use-enabled-feature-flags", () => ({
  useEnabledFeatureFlags: () => ({ pages: false }),
}));
vi.mock("../shared/not-found", () => ({ NotFound: () => null }));
vi.mock("./[shortname].page/util", () => ({
  parseProfilePageUrlQueryParams: () => ({
    profileShortname: "profile",
    currentTabTitle: "Types",
  }),
}));
vi.mock("./[shortname].page/profile-page-header", () => ({
  ProfilePageHeader: () => null,
}));
vi.mock("./[shortname].page/edit-user-profile-info-modal", () => ({
  EditUserProfileInfoModal: () => null,
}));
vi.mock("./[shortname].page/profile-page-content", () => ({
  ProfilePageContent: vi.fn(() => null),
}));

const dataType = (
  slug: string,
  version = 1,
  webId: string | undefined = "profile-web",
) =>
  ({
    schema: {
      $id: `https://hash.ai/@profile/types/data-type/${slug}/v/${version}`,
      title: `${slug} version ${version}`,
    },
    metadata: {
      ...(webId ? { webId } : {}),
      recordId: {
        baseUrl: `https://hash.ai/@profile/types/data-type/${slug}/`,
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as unknown as DataTypeWithMetadata;

const SaveType = ({ saved }: { saved: DataTypeWithMetadata }) => {
  const { onDataTypeSaved } = useDataTypesContext();
  return (
    <Box component="button" onClick={() => onDataTypeSaved(saved)}>
      Save type
    </Box>
  );
};

const setup = (saved: DataTypeWithMetadata) => {
  const operations: Operation[] = [];
  const pending: ((result: QueryDataTypesQuery | Error) => void)[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        operations.push(operation);
        if (operation.operationName === "queryDataTypes") {
          pending.push((result) => {
            if (result instanceof Error) {
              observer.error(result);
            } else {
              observer.next({ data: result });
              observer.complete();
            }
          });
        } else if (operation.operationName === "queryEntityTypes") {
          observer.next({ data: { queryEntityTypes: { entityTypes: [] } } });
          observer.complete();
        } else if (operation.operationName === "queryPropertyTypes") {
          observer.next({
            data: { queryPropertyTypes: { propertyTypes: [] } },
          });
          observer.complete();
        } else {
          observer.error(
            new Error(`Unexpected query ${operation.operationName}`),
          );
        }
      }),
  );
  render(
    <MockedProvider link={link}>
      <SnackbarProvider>
        <DataTypesContextProvider>
          <ProfilePage />
          <SaveType saved={saved} />
        </DataTypesContextProvider>
      </SnackbarProvider>
    </MockedProvider>,
  );
  return {
    operations,
    respond: async (result: QueryDataTypesQuery | Error) => {
      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      const next = pending.shift();
      if (!next) {
        throw new Error("No catalogue request is pending");
      }
      await act(() => Promise.resolve(next(result)));
    },
  };
};

describe("profile data type catalogue", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows every owned latest type and updates a saved version before reconciliation completes", async () => {
    const latest = dataType("length", 2);
    const { operations, respond } = setup(latest);
    const own = [
      dataType("length"),
      ...Array.from({ length: 1000 }, (_, index) => dataType(`type-${index}`)),
    ];
    await respond({
      queryDataTypes: {
        dataTypes: own.slice(0, 1000),
        cursor: own[999]?.schema.$id,
      },
    });
    await respond({
      queryDataTypes: {
        dataTypes: [
          ...own.slice(1000),
          dataType("foreign", 1, "other-web"),
          dataType("external", 1, ""),
        ],
      },
    });
    await waitFor(() =>
      expect(
        vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypesLoading,
      ).toBe(false),
    );
    expect(vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypes).toEqual(
      own,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save type" }));
    expect(vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypes).toEqual([
      latest,
      ...own.slice(1),
    ]);
    expect(
      vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypesLoading,
    ).toBe(false);
    await respond(new Error("Background refresh failed"));
    expect(vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypes).toEqual([
      latest,
      ...own.slice(1),
    ]);
    await screen.findByRole("button", { name: "Retry" });
    expect(
      operations
        .filter(({ operationName }) => operationName === "queryDataTypes")
        .map(({ variables }) => variables.request.filter),
    ).toEqual([{ all: [] }, { all: [] }, { all: [] }]);
  });

  it("stops loading after an initial failure and accepts an empty catalogue on retry", async () => {
    const { respond } = setup(dataType("unused"));
    await respond(new Error("Catalogue unavailable"));
    const failed = vi.mocked(ProfilePageContent).mock.lastCall?.[0];
    expect(failed?.webTypesLoading).toBe(false);
    expect(failed?.webTypesError).toMatchObject({
      message: "Catalogue unavailable",
    });

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypesLoading,
    ).toBe(true);
    await respond({ queryDataTypes: { dataTypes: [] } });
    const loaded = vi.mocked(ProfilePageContent).mock.lastCall?.[0];
    expect(loaded?.webTypesLoading).toBe(false);
    expect(loaded?.webTypesError).toBeNull();
    expect(loaded?.webTypes).toEqual([]);
  });

  it("adds a newly created type to the owning profile immediately", async () => {
    const created = dataType("new-type");
    const { respond } = setup(created);
    await respond({ queryDataTypes: { dataTypes: [dataType("length")] } });
    fireEvent.click(screen.getByRole("button", { name: "Save type" }));
    expect(vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypes).toEqual([
      dataType("length"),
      created,
    ]);
    await respond({
      queryDataTypes: { dataTypes: [dataType("length"), created] },
    });
    expect(vi.mocked(ProfilePageContent).mock.lastCall?.[0].webTypes).toEqual([
      dataType("length"),
      created,
    ]);
  });
});
