/**
 * @todo: remove this when there's WASM support in jest (@see https://github.com/facebook/jest/pull/13505), or
 * if we switch to the `@blockprotocol/type-system` package (@see https://github.com/hashintel/hash/pull/1166)
 */

jest.mock(
  "@blockprotocol/type-system",
  () => {
    return {
      __esModule: true,
      extractBaseUri: jest.fn(() => ""),
    };
  },
  { virtual: true },
);

jest.mock("../lib/use-init-type-system.tsx", () => ({
  __esModule: true,
  useInitTypeSystem: jest.fn(() => false),
}));

export {};
