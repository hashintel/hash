// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { statusUpdateDomId, useStatusUpdateFocus } from "./status-focus";

import type { StatusEntry } from "../status";
import type { EntityId } from "@blockprotocol/type-system";

const statusEntry: StatusEntry = {
  entityId:
    "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as EntityId,
  at: "2026-07-30T08:00:00.000Z",
  user: "Alex",
  category: "Investigation update",
  tokens: [{ tokenType: "text", text: "Reviewing" }],
  text: "Reviewing",
};

describe("status update focus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("provides a stable DOM anchor based on the status entity UUID", () => {
    expect(statusUpdateDomId(statusEntry)).toBe(
      "status-update-00000000-0000-0000-0000-000000000002",
    );
  });

  it("scrolls to the focused update and briefly highlights it", async () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    const { result, rerender } = renderHook(
      ({
        focusedStatusUpdateUuid,
      }: {
        focusedStatusUpdateUuid: string | null;
      }) =>
        useStatusUpdateFocus({
          focusedStatusUpdateUuid,
          statusEntries: [statusEntry],
        }),
      {
        initialProps: {
          focusedStatusUpdateUuid: null as string | null,
        },
      },
    );

    result.current.focusedStatusUpdateRef.current = {
      scrollIntoView,
    } as unknown as HTMLDivElement;
    rerender({
      focusedStatusUpdateUuid: "00000000-0000-0000-0000-000000000002",
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(result.current.highlightedStatusUpdateUuid).toBe(
      "00000000-0000-0000-0000-000000000002",
    );

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.highlightedStatusUpdateUuid).toBeNull();
  });
});
