import { NextRouter, useRouter } from "next/router";

jest.mock("next/router", () => ({
  __esModule: true,
  useRouter: jest.fn(),
}));

export function mockUseRouter(
  props?: Partial<Pick<NextRouter, "route" | "pathname" | "query" | "asPath">>
) {
  const defaults = {
    push: jest.fn(),
    route: "/",
    pathname: "/",
    query: {},
    asPath: "/",
    prefetch: () => new Promise<void>((resolve) => resolve()),
  };

  (useRouter as jest.Mock).mockReturnValue({
    ...defaults,
    ...(props ? props : {}),
  });
}
