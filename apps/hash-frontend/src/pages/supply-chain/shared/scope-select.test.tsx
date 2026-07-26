// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScopeSelect } from "./scope-select";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  router: {
    asPath: "/supply-chain/product/product-a",
    pathname: "/supply-chain/product/[productId]",
    query: { productId: "product-a" },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ ...mocks.router, push: mocks.push }),
}));

vi.mock("./registry-context", () => ({
  useRegistry: () => ({
    products: [
      { id: "product-a", name: "Product A" },
      { id: "product-b", name: "Product B" },
    ],
    sites: [{ slug: "site-a", name: "Site A" }],
  }),
}));

vi.mock("./searchable-select", () => ({
  SearchableSelect: ({ onChange }: { onChange: (value: string) => void }) => (
    <>
      <button type="button" onClick={() => onChange("product-b")}>
        Choose product
      </button>
      <button type="button" onClick={() => onChange("site:site-a")}>
        Choose site
      </button>
    </>
  ),
}));

describe("ScopeSelect", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.push.mockReset();
    window.history.replaceState({}, "", "/supply-chain/product/product-a");
    mocks.router.asPath = "/supply-chain/product/product-a";
    mocks.router.pathname = "/supply-chain/product/[productId]";
    mocks.router.query = { productId: "product-a" };
  });

  it("preserves a browser-backed view for products but omits it for sites", () => {
    window.history.replaceState(
      {},
      "",
      "/supply-chain/product/product-a?view=schedule",
    );
    render(<ScopeSelect productId="product-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose product" }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/supply-chain/product/product-b?view=schedule",
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose site" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/supply-chain/site/site-a");
  });

  it("uses a view changed through browser history immediately before navigation", () => {
    render(<ScopeSelect productId="product-a" />);
    window.history.pushState(
      {},
      "",
      "/supply-chain/product/product-a?view=canvas",
    );
    fireEvent.popState(window);

    fireEvent.click(screen.getByRole("button", { name: "Choose product" }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/supply-chain/product/product-b?view=canvas",
    );
  });
});
