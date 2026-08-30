/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useJumpHistory } from "./use-jump-history";

describe("useJumpHistory", () => {
  it("starts with nowhere to go", () => {
    const { result } = renderHook(() => useJumpHistory());
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it("walks back along recorded jumps and forward again", () => {
    const { result } = renderHook(() => useJumpHistory());

    act(() => result.current.record("a", "b"));
    act(() => result.current.record("b", "c"));
    expect(result.current.canGoBack).toBe(true);

    let target: string | null = null;
    act(() => {
      target = result.current.back("c");
    });
    expect(target).toBe("b");
    act(() => {
      target = result.current.back("b");
    });
    expect(target).toBe("a");
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);

    act(() => {
      target = result.current.forward("a");
    });
    expect(target).toBe("b");
    act(() => {
      target = result.current.forward("b");
    });
    expect(target).toBe("c");
    expect(result.current.canGoForward).toBe(false);
  });

  it("discards the forward leg when a new jump is recorded", () => {
    const { result } = renderHook(() => useJumpHistory());

    act(() => result.current.record("a", "b"));
    act(() => {
      result.current.back("b");
    });
    expect(result.current.canGoForward).toBe(true);

    act(() => result.current.record("a", "z"));
    expect(result.current.canGoForward).toBe(false);
    let target: string | null = null;
    act(() => {
      target = result.current.back("z");
    });
    expect(target).toBe("a");
  });

  it("ignores self-jumps and unknown origins", () => {
    const { result } = renderHook(() => useJumpHistory());

    act(() => result.current.record(null, "b"));
    act(() => result.current.record("b", "b"));
    expect(result.current.canGoBack).toBe(false);
    let target: string | null = "unset" as string | null;
    act(() => {
      target = result.current.back(null);
    });
    expect(target).toBeNull();
  });
});
