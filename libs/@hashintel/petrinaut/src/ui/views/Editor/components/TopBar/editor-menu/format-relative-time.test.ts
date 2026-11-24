import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { formatRelativeTime } from "./format-relative-time";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-20T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

test.each([
  ["2026-03-20T12:00:00", "now"],
  ["2026-03-20T11:59:15", "45 seconds ago"],
  ["2026-03-20T11:58:00", "2 minutes ago"],
  ["2026-03-20T09:00:00", "3 hours ago"],
  ["2026-03-19T12:00:00", "yesterday"],
  ["2026-03-08T12:00:00", "12 days ago"],
  ["2026-02-10T12:00:00", "Feb 10"],
])("describes %s as %s", (timestamp, expected) => {
  expect(formatRelativeTime(timestamp)).toBe(expected);
});
