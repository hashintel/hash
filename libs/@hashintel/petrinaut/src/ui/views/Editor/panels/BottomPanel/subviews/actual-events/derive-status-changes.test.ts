import { describe, expect, it } from "vitest";

import { deriveActualEventStatusChanges } from "./derive-status-changes";

import type { SDCPN, StatusView } from "@hashintel/petrinaut-core";

const definition: Pick<SDCPN, "places" | "types"> = {
  places: (["todo", "doing", "done"] as const).map((id) => ({
    id,
    name: id,
    colorId: "ticket",
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  })),
  types: [
    {
      id: "ticket",
      name: "Ticket",
      iconSlug: "circle",
      displayColor: "#0000FF",
      elements: [
        {
          elementId: "ticket-id",
          name: "ticket_id",
          type: "string",
          identityRef: "identity-ticket",
        },
      ],
    },
  ],
};

const statusView: StatusView = {
  id: "view-1",
  name: "Ticket status",
  identityRef: "identity-ticket",
  labels: [
    { id: "l-todo", name: "Todo", displayColor: "#888888", places: ["todo"] },
    {
      id: "l-doing",
      name: "Doing",
      displayColor: "#2563eb",
      places: ["doing"],
    },
    { id: "l-done", name: "Done", displayColor: "#16a34a", places: ["done"] },
    {
      id: "l-gone",
      name: "Archived",
      displayColor: "#64748b",
      places: [],
      isExit: true,
    },
  ],
};

describe("deriveActualEventStatusChanges", () => {
  it("tracks per-instance label changes with dwell in the previous label", () => {
    const changes = deriveActualEventStatusChanges({
      statusView,
      definition,
      transitionFirings: [
        {
          transitionId: "create",
          input: {},
          output: { todo: 1 },
          outputTokens: { todo: [{ ticket_id: "a" }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
        {
          transitionId: "start",
          input: { todo: 1 },
          output: { doing: 1 },
          inputTokens: { todo: [{ ticket_id: "a" }] },
          outputTokens: { doing: [{ ticket_id: "a" }] },
          ts: "2026-06-05T10:00:04.000Z",
        },
        {
          transitionId: "archive",
          input: { doing: 1 },
          output: {},
          inputTokens: { doing: [{ ticket_id: "a" }] },
          ts: "2026-06-05T10:00:10.000Z",
        },
      ],
    });

    expect(changes).toEqual([
      [
        {
          keyDisplay: "a",
          fromLabelName: null,
          toLabelName: "Todo",
          dwellMs: null,
        },
      ],
      [
        {
          keyDisplay: "a",
          fromLabelName: "Todo",
          toLabelName: "Doing",
          dwellMs: 4_000,
        },
      ],
      [
        {
          keyDisplay: "a",
          fromLabelName: "Doing",
          toLabelName: "Archived",
          dwellMs: 6_000,
        },
      ],
    ]);
  });

  it("emits nothing for firings without token values", () => {
    const changes = deriveActualEventStatusChanges({
      statusView,
      definition,
      transitionFirings: [
        {
          transitionId: "start",
          input: { todo: 1 },
          output: { doing: 1 },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
    });

    expect(changes).toEqual([[]]);
  });
});
