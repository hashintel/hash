/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { useStableActions } from "./use-stable-actions";

it("keeps each function at its identity and calls the latest one", () => {
  const { result, rerender } = renderHook(
    ({ step }) => useStableActions({ add: (value: number) => value + step }),
    { initialProps: { step: 1 } },
  );
  const { add } = result.current;
  expect(add(1)).toBe(2);

  rerender({ step: 10 });

  expect(result.current.add).toBe(add);
  expect(add(1)).toBe(11);
});
