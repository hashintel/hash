import type { SDCPN } from "../types/sdcpn";

/**
 * Ticket workflow demonstrating identities and status views.
 *
 * Tickets arrive stochastically and flow Todo → In Progress → In Review →
 * Done, with a Blocked side-track and a review loop that sends work back to
 * In Progress, so one ticket can enter a status several times. Every ticket
 * carries a `ticket_id` key element referencing the Ticket identity, and the
 * "Ticket status" view maps each place to a label in Kanban column order.
 * Done is an explicit sink place, so completion is an ordinary place label;
 * archiving consumes the token outright, which the view's exit label
 * ("Archived") captures.
 */
export const ticketProcessingSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Ticket Processing",
  petriNetDefinition: {
    places: [
      {
        id: "place__todo",
        name: "Todo",
        colorId: "type__ticket",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 180,
        y: 0,
      },
      {
        id: "place__in-progress",
        name: "InProgress",
        colorId: "type__ticket",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 480,
        y: 0,
      },
      {
        id: "place__in-review",
        name: "InReview",
        colorId: "type__ticket",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 780,
        y: 0,
      },
      {
        id: "place__blocked",
        name: "Blocked",
        colorId: "type__ticket",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 480,
        y: 240,
      },
      {
        id: "place__done",
        name: "Done",
        colorId: "type__ticket",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 1080,
        y: 0,
      },
    ],
    transitions: [
      {
        id: "transition__create-ticket",
        name: "Create Ticket",
        inputArcs: [],
        outputArcs: [{ placeId: "place__todo", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `// Ticket arrivals: expected new tickets per simulation second.
return parameters.ticket_arrival_rate;`,
        transitionKernelCode: `// Create one Ticket token. ticket_id is omitted, so the runtime assigns a
// fresh UUID — that key value is what identifies the ticket everywhere else.
const rawPriority = Distribution.Gaussian(0.5, 0.2);
return {
  Todo: [
    {
      priority: rawPriority.map((p) => Math.max(0.05, Math.min(1, p))),
    },
  ],
};`,
        x: -60,
        y: 0,
      },
      {
        id: "transition__start-work",
        name: "Start Work",
        inputArcs: [{ placeId: "place__todo", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__in-progress", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `// Higher-priority tickets are picked up sooner.
const ticket = input.Todo[0];
return parameters.start_rate * (0.5 + ticket.priority);`,
        transitionKernelCode: `// Copy the key element so the ticket keeps its identity across places.
const ticket = input.Todo[0];
return {
  InProgress: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 330,
        y: 0,
      },
      {
        id: "transition__send-to-review",
        name: "Send To Review",
        inputArcs: [
          { placeId: "place__in-progress", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__in-review", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `return parameters.review_rate;`,
        transitionKernelCode: `const ticket = input.InProgress[0];
return {
  InReview: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 630,
        y: 0,
      },
      {
        id: "transition__request-changes",
        name: "Request Changes",
        inputArcs: [
          { placeId: "place__in-review", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__in-progress", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `// Review loop: sends the ticket back, so it re-enters In Progress and its
// time-in-status becomes multi-interval.
return parameters.rework_rate;`,
        transitionKernelCode: `const ticket = input.InReview[0];
return {
  InProgress: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 630,
        y: -160,
      },
      {
        id: "transition__get-blocked",
        name: "Get Blocked",
        inputArcs: [
          { placeId: "place__in-progress", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__blocked", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `return parameters.block_rate;`,
        transitionKernelCode: `const ticket = input.InProgress[0];
return {
  Blocked: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 330,
        y: 240,
      },
      {
        id: "transition__unblock",
        name: "Unblock",
        inputArcs: [{ placeId: "place__blocked", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__in-progress", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `return parameters.unblock_rate;`,
        transitionKernelCode: `const ticket = input.Blocked[0];
return {
  InProgress: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 630,
        y: 240,
      },
      {
        id: "transition__approve",
        name: "Approve",
        inputArcs: [
          { placeId: "place__in-review", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__done", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: `return parameters.approve_rate;`,
        transitionKernelCode: `// Done is an explicit sink place, so completed tickets keep a marking-derived
// label rather than needing the exit label.
const ticket = input.InReview[0];
return {
  Done: [{ ticket_id: ticket.ticket_id, priority: ticket.priority }],
};`,
        x: 930,
        y: 0,
      },
      {
        id: "transition__archive-ticket",
        name: "Archive Ticket",
        inputArcs: [{ placeId: "place__done", weight: 1, type: "standard" }],
        outputArcs: [],
        lambdaType: "stochastic",
        lambdaCode: `// Archiving consumes the token outright: the ticket leaves every place of
// the status view, so the view's exit label ("Archived") takes over.
return parameters.archive_rate;`,
        transitionKernelCode: "",
        x: 1230,
        y: 0,
      },
    ],
    types: [
      {
        id: "type__ticket",
        name: "Ticket",
        iconSlug: "circle",
        displayColor: "#2563eb",
        elements: [
          {
            elementId: "ticket__id",
            name: "ticket_id",
            type: "uuid",
            identityRef: "identity__ticket",
          },
          {
            elementId: "ticket__priority",
            name: "priority",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "param__ticket_arrival_rate",
        name: "Ticket Arrival Rate",
        variableName: "ticket_arrival_rate",
        type: "real",
        defaultValue: "0.4",
      },
      {
        id: "param__start_rate",
        name: "Start Rate",
        variableName: "start_rate",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "param__review_rate",
        name: "Review Rate",
        variableName: "review_rate",
        type: "real",
        defaultValue: "0.45",
      },
      {
        id: "param__rework_rate",
        name: "Rework Rate",
        variableName: "rework_rate",
        type: "real",
        defaultValue: "0.15",
      },
      {
        id: "param__block_rate",
        name: "Block Rate",
        variableName: "block_rate",
        type: "real",
        defaultValue: "0.08",
      },
      {
        id: "param__unblock_rate",
        name: "Unblock Rate",
        variableName: "unblock_rate",
        type: "real",
        defaultValue: "0.25",
      },
      {
        id: "param__approve_rate",
        name: "Approve Rate",
        variableName: "approve_rate",
        type: "real",
        defaultValue: "0.35",
      },
      {
        id: "param__archive_rate",
        name: "Archive Rate",
        variableName: "archive_rate",
        type: "real",
        defaultValue: "0.05",
      },
    ],
    identities: [
      {
        id: "identity__ticket",
        name: "Ticket",
        keyElementTypes: ["uuid"],
      },
    ],
    statusViews: [
      {
        id: "status-view__ticket",
        name: "Ticket status",
        description:
          "Where each ticket sits in the workflow, with time-in-status derived from the firing log.",
        identityRef: "identity__ticket",
        labels: [
          {
            id: "status-label__todo",
            name: "Todo",
            displayColor: "#94a3b8",
            places: ["place__todo"],
          },
          {
            id: "status-label__in-progress",
            name: "In Progress",
            displayColor: "#2563eb",
            places: ["place__in-progress"],
          },
          {
            id: "status-label__in-review",
            name: "In Review",
            displayColor: "#9333ea",
            places: ["place__in-review"],
          },
          {
            id: "status-label__blocked",
            name: "Blocked",
            displayColor: "#dc2626",
            places: ["place__blocked"],
          },
          {
            id: "status-label__done",
            name: "Done",
            displayColor: "#16a34a",
            places: ["place__done"],
          },
          {
            id: "status-label__archived",
            name: "Archived",
            displayColor: "#64748b",
            places: [],
            isExit: true,
          },
        ],
      },
    ],
    metrics: [
      {
        id: "metric__open_tickets",
        name: "Open tickets",
        description: "Tickets anywhere in the workflow that are not yet done.",
        code: `return (
  state.places.Todo.count +
  state.places.InProgress.count +
  state.places.InReview.count +
  state.places.Blocked.count
);`,
      },
      {
        id: "metric__done_tickets",
        name: "Done tickets",
        description: "Tickets sitting in the Done sink place.",
        code: `return state.places.Done.count;`,
      },
    ],
    scenarios: [
      {
        id: "scenario__steady_intake",
        name: "Steady intake",
        description:
          "Tickets arrive at a steady rate against a modest review loop and occasional blockers.",
        scenarioParameters: [
          { type: "real", identifier: "arrival_rate", default: 0.4 },
          { type: "real", identifier: "block_rate", default: 0.08 },
        ],
        parameterOverrides: {
          param__ticket_arrival_rate: "scenario.arrival_rate",
          param__block_rate: "scenario.block_rate",
        },
        initialState: {
          type: "per_place",
          content: {},
        },
      },
    ],
  },
};
