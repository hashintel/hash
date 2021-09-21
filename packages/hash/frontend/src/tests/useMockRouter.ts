import { NextRouter } from "next/router";

jest.mock("next/router", () => ({
  __esModule: true,
  useRouter: jest.fn(),
}));

const useRouter = jest.spyOn(require("next/router"), "useRouter");

export function useMockRouter(
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

  useRouter.mockReturnValue({
    ...defaults,
    ...(props ? props : {}),
  });
}
