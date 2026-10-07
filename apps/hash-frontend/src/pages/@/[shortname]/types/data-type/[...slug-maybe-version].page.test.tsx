import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import Page from "./[...slug-maybe-version].page";

const router = vi.hoisted(() => ({
  query: {},
  asPath: "",
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("../../../../../shared/layout", () => ({
  getLayoutWithSidebar: () => null,
}));
vi.mock("../../../../shared/not-found", () => ({
  NotFound: () => "not found",
}));
vi.mock("../../../../shared/data-type", () => ({
  DataType: ({ requestedVersion }: { requestedVersion: string | null }) =>
    requestedVersion ?? "latest",
}));
vi.mock("../../../../../shared/generate-link-parameters", () => ({
  generateLinkParameters: () => ({ href: "/" }),
}));
vi.mock("../../shared/use-route-namespace", () => ({
  useRouteNamespace: () => ({
    loading: false,
    routeNamespace: { webId: "alice" },
  }),
}));
vi.mock("../shared/get-type-base-url", () => ({
  getTypeBaseUrl: () => "http://example.com/types/data-type/test/",
}));

const renderVersion = (version?: string) => {
  router.asPath = `/@alice/types/data-type/test${version === undefined ? "" : `/v/${version}`}`;
  return renderToStaticMarkup(<Page />);
};

describe("data type route versions", () => {
  test.each(["0", "4294967296", "-1", "1.5", "invalid", "1invalid"])(
    "renders not found for version %s",
    (version) => {
      expect(renderVersion(version)).toBe("not found");
    },
  );

  test.each(["1", "4294967295"])("renders version %s", (version) => {
    expect(renderVersion(version)).toContain(version);
  });

  test.each(["1?tab=definition", "1#definition"])(
    "renders a valid version with a query or fragment: %s",
    (version) => {
      expect(renderVersion(version)).toContain("1");
      expect(renderVersion(version)).not.toContain("not found");
    },
  );

  test("renders the latest version when no version is requested", () => {
    expect(renderVersion()).toContain("latest");
  });
});
