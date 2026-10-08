import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import Page from "./[...base64-baseurl-maybe-version].page";

const router = vi.hoisted(() => ({
  query: {},
  asPath: "",
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("../../../../shared/layout", () => ({
  getLayoutWithSidebar: () => null,
}));
vi.mock("../../../shared/not-found", () => ({ NotFound: () => "not found" }));
vi.mock("../../../shared/entity-type", () => ({
  EntityType: ({ requestedVersion }: { requestedVersion: string | null }) =>
    requestedVersion ?? "latest",
}));

const renderVersion = (version?: string) => {
  router.query = {
    "base64-baseurl-maybe-version": [
      btoa("http://example.com/types/entity-type/test/"),
      ...(version === undefined ? [] : ["v", version]),
    ],
  };
  return renderToStaticMarkup(<Page />);
};

describe("entity type route versions", () => {
  test.each(["0", "4294967296", "-1", "1.5", "invalid", "1invalid"])(
    "renders not found for version %s",
    (version) => {
      expect(renderVersion(version)).toBe("not found");
    },
  );

  test.each(["1", "4294967295"])("renders version %s", (version) => {
    expect(renderVersion(version)).toContain(version);
  });

  test("renders the latest version when no version is requested", () => {
    expect(renderVersion()).toContain("latest");
  });
});
