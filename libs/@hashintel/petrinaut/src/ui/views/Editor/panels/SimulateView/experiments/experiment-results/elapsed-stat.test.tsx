/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ElapsedStat } from "./elapsed-stat";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ElapsedStat", () => {
  it("dashes out an experiment whose stepping never began", () => {
    const { container } = render(
      <ElapsedStat startedAt={null} finishedAt={null} active={false} />,
    );
    expect(container.textContent).toBe("—");
  });

  it("ticks every quarter second while active and holds at the finish once it is not", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { container, rerender } = render(
      <ElapsedStat startedAt={8_500} finishedAt={null} active />,
    );
    expect(container.textContent).toBe("1.50s");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(container.textContent).toBe("2.50s");

    rerender(
      <ElapsedStat startedAt={8_500} finishedAt={9_750} active={false} />,
    );
    expect(container.textContent).toBe("1.25s");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(container.textContent).toBe("1.25s");
  });
});
