import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import {
  makeTicketPlace,
  ticketColor,
} from "../../../../../shared/status-view.test-helpers";
import { createActualEventStatusDeriver } from "./derive-status-changes";

import type { SDCPN, StatusView } from "@hashintel/petrinaut-core";

const definition: SDCPN = {
  places: [
    makeTicketPlace("todo", "todo"),
    makeTicketPlace("doing", "doing"),
    makeTicketPlace("done", "done"),
  ],
  transitions: [],
  types: [ticketColor],
  differentialEquations: [],
  parameters: [],
  identities: [
    { id: "identity-ticket", name: "Ticket", keyElementTypes: ["string"] },
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

describe("createActualEventStatusDeriver", () => {
  it("tracks per-instance label changes with dwell in the previous label", () => {
    const deriver = createActualEventStatusDeriver({
      statusView,
      definition,
      initialState: {},
    });
    const changes = deriver.deriveUpTo([
      {
        transitionId: "create",
        inputTokens: {},
        outputTokens: { todo: [{ ticket_id: "a" }] },
        ts: "2026-06-05T10:00:00.000Z",
      },
      {
        transitionId: "start",
        inputTokens: { todo: [{ ticket_id: "a" }] },
        outputTokens: { doing: [{ ticket_id: "a" }] },
        ts: "2026-06-05T10:00:04.000Z",
      },
      {
        transitionId: "archive",
        inputTokens: { doing: [{ ticket_id: "a" }] },
        outputTokens: {},
        ts: "2026-06-05T10:00:10.000Z",
      },
    ]);

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

  it("folds newly appended firings without rederiving earlier rows", () => {
    const deriver = createActualEventStatusDeriver({
      statusView,
      definition,
      initialState: { todo: [{ ticket_id: "a" }] },
    });
    const firstFiring = {
      transitionId: "start",
      inputTokens: { todo: [{ ticket_id: "a" }] },
      outputTokens: { doing: [{ ticket_id: "a" }] },
      ts: "2026-06-05T10:00:05.000Z",
    };

    const first = deriver.deriveUpTo([firstFiring]);
    // The instance sat in Todo from the initial state, so its first change
    // reports the real starting label and dwell.
    expect(first).toEqual([
      [
        {
          keyDisplay: "a",
          fromLabelName: "Todo",
          toLabelName: "Doing",
          dwellMs: 0,
        },
      ],
    ]);

    const second = deriver.deriveUpTo([
      firstFiring,
      {
        transitionId: "finish",
        inputTokens: { doing: [{ ticket_id: "a" }] },
        outputTokens: { done: [{ ticket_id: "a" }] },
        ts: "2026-06-05T10:00:08.000Z",
      },
    ]);
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(first[0]);
    expect(second[1]).toEqual([
      {
        keyDisplay: "a",
        fromLabelName: "Doing",
        toLabelName: "Done",
        dwellMs: 3_000,
      },
    ]);
  });

  it("honors token conditions like the frame evaluator", () => {
    const conditionedView: StatusView = {
      ...statusView,
      labels: [
        {
          id: "l-retrying",
          name: "Retrying",
          displayColor: "#f59e0b",
          places: ["doing"],
          tokenCondition: "token.attempts > 0",
        },
        ...statusView.labels,
      ],
    };
    const { artifacts, failures } = compileHirArtifacts({
      ...definition,
      statusViews: [conditionedView],
    });
    expect(failures).toEqual([]);

    const deriver = createActualEventStatusDeriver({
      statusView: conditionedView,
      definition,
      initialState: {},
      statusConditions: artifacts.statusConditions,
    });
    const changes = deriver.deriveUpTo([
      {
        transitionId: "start",
        inputTokens: {},
        outputTokens: { doing: [{ ticket_id: "a", attempts: 0 }] },
        ts: "2026-06-05T10:00:00.000Z",
      },
      {
        transitionId: "retry",
        inputTokens: { doing: [{ ticket_id: "a", attempts: 0 }] },
        outputTokens: { doing: [{ ticket_id: "a", attempts: 1 }] },
        ts: "2026-06-05T10:00:03.000Z",
      },
    ]);

    expect(changes).toEqual([
      [
        {
          keyDisplay: "a",
          fromLabelName: null,
          toLabelName: "Doing",
          dwellMs: null,
        },
      ],
      [
        {
          keyDisplay: "a",
          fromLabelName: "Doing",
          toLabelName: "Retrying",
          dwellMs: 3_000,
        },
      ],
    ]);
  });

  it("derives changes for scoped component-instance places", () => {
    const scopedDefinition: SDCPN = {
      ...definition,
      places: [],
      types: [],
      subnets: [
        {
          id: "subnet-1",
          name: "Worker",
          places: [
            {
              id: "inner-doing",
              name: "InnerDoing",
              colorId: ticketColor.id,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
          ],
          transitions: [],
          types: definition.types,
          differentialEquations: [],
          parameters: [],
        },
      ],
      componentInstances: [
        {
          id: "instance-1",
          name: "WorkerA",
          subnetId: "subnet-1",
          parameterValues: {},
          x: 0,
          y: 0,
        },
      ],
    };
    const scopedView: StatusView = {
      ...statusView,
      labels: [
        {
          id: "l-doing",
          name: "Doing",
          displayColor: "#2563eb",
          places: ["instance-1::inner-doing"],
        },
      ],
    };

    const deriver = createActualEventStatusDeriver({
      statusView: scopedView,
      definition: scopedDefinition,
      initialState: {},
    });
    const changes = deriver.deriveUpTo([
      {
        transitionId: "instance-1::start",
        inputTokens: {},
        outputTokens: { "instance-1::inner-doing": [{ ticket_id: "a" }] },
        ts: "2026-06-05T10:00:00.000Z",
      },
    ]);

    expect(changes).toEqual([
      [
        {
          keyDisplay: "a",
          fromLabelName: null,
          toLabelName: "Doing",
          dwellMs: null,
        },
      ],
    ]);
  });

  it("emits nothing for firings whose tokens carry no attributes", () => {
    const deriver = createActualEventStatusDeriver({
      statusView,
      definition,
      initialState: { todo: 1 },
    });
    const changes = deriver.deriveUpTo([
      {
        transitionId: "start",
        inputTokens: { todo: [{}] },
        outputTokens: { doing: [{}] },
        ts: "2026-06-05T10:00:00.000Z",
      },
    ]);

    expect(changes).toEqual([[]]);
  });
});
