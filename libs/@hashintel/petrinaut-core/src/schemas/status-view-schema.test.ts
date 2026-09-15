import { describe, expect, it } from "vitest";

import { statusViewSchema } from "./status-view-schema";

import type { StatusView } from "../types/sdcpn";

const todoLabel = {
  id: "label-todo",
  name: "Todo",
  displayColor: "#808080",
  places: ["place-todo"],
};

const inProgressLabel = {
  id: "label-in-progress",
  name: "In Progress",
  displayColor: "#1E90FF",
  places: ["place-doing", "instance-1::place-doing"],
  tokenCondition: "attempts === 0",
};

const exitLabel = {
  id: "label-exit",
  name: "Gone",
  displayColor: "#333333",
  places: [],
  isExit: true,
};

const validStatusView: StatusView = {
  id: "view-1",
  name: "Ticket status",
  identityRef: "identity-ticket",
  labels: [todoLabel, inProgressLabel, exitLabel],
};

const parseExpectingIssues = (input: unknown) => {
  const result = statusViewSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues;
};

describe("statusViewSchema", () => {
  it("accepts a view with place labels, a token condition, and one exit label", () => {
    expect(statusViewSchema.parse(validStatusView)).toEqual(validStatusView);
  });

  it("rejects duplicate label ids", () => {
    const issues = parseExpectingIssues({
      ...validStatusView,
      labels: [todoLabel, { ...inProgressLabel, id: todoLabel.id }],
    });
    expect(issues.some((issue) => issue.path.includes("id"))).toBe(true);
  });

  it("rejects duplicate label names", () => {
    const issues = parseExpectingIssues({
      ...validStatusView,
      labels: [todoLabel, { ...inProgressLabel, name: "Todo" }],
    });
    expect(issues.some((issue) => issue.path.includes("name"))).toBe(true);
  });

  it("rejects more than one exit label", () => {
    const issues = parseExpectingIssues({
      ...validStatusView,
      labels: [exitLabel, { ...exitLabel, id: "label-exit-2", name: "Gone 2" }],
    });
    expect(
      issues.some((issue) => issue.message.includes("at most one exit label")),
    ).toBe(true);
  });

  it("rejects an exit label with places", () => {
    const issues = parseExpectingIssues({
      ...validStatusView,
      labels: [{ ...exitLabel, places: ["place-done"] }],
    });
    expect(issues.some((issue) => issue.path.includes("places"))).toBe(true);
  });
});
