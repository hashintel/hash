#!/usr/bin/env node

/**
 * Local Brunch-compatible SSE fixture for testing Petrinaut Actual mode.
 *
 * The script serves a small Petri net execution plan, an initial marking,
 * historical transition firings, and then streams new `transition_firing`
 * events over `/stream`. It also exposes `/snapshot` for inspecting the full
 * fixture state as JSON and prints copy-pasteable Petrinaut `/brunch` URLs
 * when it starts.
 *
 * This Brunch/Petrinaut interface is experimental: the event names, payload
 * shapes, and endpoint layout are only for this first integration pass. The
 * durable version will likely become a protocol owned by Petrinaut Core and
 * standardized with the Brunch team later.
 */

import http, { type ServerResponse } from "node:http";

type BrunchArcType = "standard" | "read" | "inhibitor";

type InputArc = {
  placeId: string;
  type: BrunchArcType;
  weight: number;
};

type OutputArc = {
  placeId: string;
  weight: number;
};

type Place = {
  id: string;
  name: string;
};

type Transition = {
  id: string;
  inputArcs: InputArc[];
  name: string;
  outputArcs: OutputArc[];
};

type NetDefinition = {
  meta: {
    generator: string;
    generatorVersion: string;
  };
  places: Place[];
  title: string;
  transitions: Transition[];
  version: number;
};

type Marking = Record<string, number>;

type TransitionFiring = {
  input: Marking;
  output: Marking;
  transitionId: string;
  ts: string;
};

type SseFrame =
  | { data: NetDefinition; event: "definition" }
  | { data: Marking; event: "initial_state" }
  | { data: TransitionFiring; event: "transition_firing" };

const args = new Map<string, string>(
  process.argv.slice(2).flatMap((arg) => {
    if (!arg.startsWith("--")) {
      return [];
    }

    const [key, value = "true"] = arg.slice(2).split("=");

    return [[key, value]];
  }),
);

const readPositiveNumberArg = (
  name: string,
  environmentName: string,
  defaultValue: number,
): number => {
  const rawValue = args.get(name) ?? process.env[environmentName];

  if (rawValue === undefined) {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected --${name} to be a positive number.`);
  }

  return value;
};

const host = args.get("host") ?? process.env.HOST ?? "127.0.0.1";
const intervalMs = readPositiveNumberArg("interval", "INTERVAL", 2_500);
const port = readPositiveNumberArg("port", "PORT", 5_184);
const runId = args.get("runId") ?? process.env.RUN_ID ?? "dummy-brunch-run";

const definition: NetDefinition = {
  version: 1,
  title: "Dummy Brunch Execution Plan",
  meta: {
    generator: "petrinaut-website/scripts/brunch-sse-fixture.ts",
    generatorVersion: "1",
  },
  places: [
    { id: "ideas", name: "Ideas" },
    { id: "queued", name: "Queued Work" },
    { id: "implementing", name: "Implementing" },
    { id: "reviewing", name: "Reviewing" },
    { id: "done", name: "Done" },
  ],
  transitions: [
    {
      id: "plan_task",
      name: "Plan Task",
      inputArcs: [{ placeId: "ideas", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "queued", weight: 1 }],
    },
    {
      id: "start_implementation",
      name: "Start Implementation",
      inputArcs: [{ placeId: "queued", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "implementing", weight: 1 }],
    },
    {
      id: "submit_review",
      name: "Submit Review",
      inputArcs: [{ placeId: "implementing", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "reviewing", weight: 1 }],
    },
    {
      id: "merge_change",
      name: "Merge Change",
      inputArcs: [{ placeId: "reviewing", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "done", weight: 1 }],
    },
  ],
};

const initialState: Marking = {
  ideas: 100,
  queued: 0,
  implementing: 0,
  reviewing: 0,
  done: 0,
};

const transitionById = new Map(
  definition.transitions.map((transition) => [transition.id, transition]),
);

const cloneMarking = (marking: Marking): Marking => ({ ...marking });

const getTransition = (transitionId: string): Transition => {
  const transition = transitionById.get(transitionId);

  if (!transition) {
    throw new Error(`Unknown transition: ${transitionId}`);
  }

  return transition;
};

const canFire = (marking: Marking, transitionId: string): boolean => {
  const transition = getTransition(transitionId);

  return transition.inputArcs.every(
    (arc) => (marking[arc.placeId] ?? 0) >= arc.weight,
  );
};

const applyTransition = (
  marking: Marking,
  transitionId: string,
): TransitionFiring => {
  const transition = getTransition(transitionId);
  const input = cloneMarking(marking);

  for (const arc of transition.inputArcs) {
    marking[arc.placeId] = (marking[arc.placeId] ?? 0) - arc.weight;
  }

  for (const arc of transition.outputArcs) {
    marking[arc.placeId] = (marking[arc.placeId] ?? 0) + arc.weight;
  }

  return {
    transitionId,
    input,
    output: cloneMarking(marking),
    ts: new Date().toISOString(),
  };
};

const currentMarking = cloneMarking(initialState);
const transitionFirings: TransitionFiring[] = [];
const replayFrames: SseFrame[] = [
  { event: "definition", data: definition },
  { event: "initial_state", data: initialState },
];

const appendFiring = (transitionId: string): TransitionFiring => {
  const firing = applyTransition(currentMarking, transitionId);

  transitionFirings.push(firing);
  replayFrames.push({ event: "transition_firing", data: firing });

  return firing;
};

for (const transitionId of [
  "plan_task",
  "start_implementation",
  "plan_task",
  "submit_review",
  "merge_change",
]) {
  appendFiring(transitionId);
}

let liveTransitionIndex = 0;
const liveTransitionCycle = [
  "start_implementation",
  "plan_task",
  "submit_review",
  "start_implementation",
  "merge_change",
  "plan_task",
  "submit_review",
  "merge_change",
];

const nextLiveFiring = (): TransitionFiring => {
  for (let attempts = 0; attempts < liveTransitionCycle.length; attempts += 1) {
    const transitionId = liveTransitionCycle[liveTransitionIndex]!;
    liveTransitionIndex =
      (liveTransitionIndex + 1) % liveTransitionCycle.length;

    if (canFire(currentMarking, transitionId)) {
      return appendFiring(transitionId);
    }
  }

  return appendFiring("plan_task");
};

const streamFrame = (
  response: ServerResponse,
  event: string,
  data: unknown,
): void => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

const streamComment = (response: ServerResponse, comment: string): void => {
  response.write(`: ${comment}\n\n`);
};

const clients = new Set<ServerResponse>();

const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
const endpoint = `http://${publicHost}:${port}/stream`;
const encodedEndpoint = encodeURIComponent(endpoint);
const brunchRoute = `/brunch?mode=actual&sse=${encodedEndpoint}&runId=${encodeURIComponent(
  runId,
)}`;
const brunchEndpointRoute = `/brunch?brunch_endpoint=${encodedEndpoint}`;
const snapshotUrl = `http://${publicHost}:${port}/snapshot`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", endpoint);

  if (url.pathname === "/stream") {
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });

    streamComment(response, "dummy Brunch SSE fixture connected");

    for (const frame of replayFrames) {
      streamFrame(response, frame.event, frame.data);
    }

    clients.add(response);

    request.on("close", () => {
      clients.delete(response);
    });

    return;
  }

  if (url.pathname === "/snapshot") {
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify(
        {
          definition,
          initialState,
          currentMarking,
          transitionFirings,
        },
        null,
        2,
      ),
    );

    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end(
    [
      "Dummy Brunch SSE fixture",
      "",
      `SSE endpoint: ${endpoint}`,
      `Petrinaut route: ${brunchRoute}`,
      `Petrinaut brunch_endpoint route: ${brunchEndpointRoute}`,
      `Snapshot JSON: ${snapshotUrl}`,
      "",
      "Connect to /stream to receive definition, initial_state, previous transition_firing events, then live transition_firing events.",
    ].join("\n"),
  );
});

const broadcastLiveFiring = (): void => {
  const firing = nextLiveFiring();

  for (const client of clients) {
    streamFrame(client, "transition_firing", firing);
  }

  console.log(
    `[${firing.ts}] transition_firing ${firing.transitionId} -> ${JSON.stringify(
      firing.output,
    )}`,
  );
};

server.listen(port, host, () => {
  console.log("Dummy Brunch SSE fixture running");
  console.log("");
  console.log(`SSE endpoint: ${endpoint}`);
  console.log(`Petrinaut route: ${brunchRoute}`);
  console.log(`Petrinaut brunch_endpoint route: ${brunchEndpointRoute}`);
  console.log(`Snapshot JSON: ${snapshotUrl}`);
  console.log("");
  console.log(`Streaming live transitions every ${intervalMs}ms.`);
  console.log("Stop with Ctrl-C.");
});

const interval = setInterval(broadcastLiveFiring, intervalMs);

const shutdown = (): void => {
  clearInterval(interval);

  for (const client of clients) {
    streamComment(client, "fixture shutting down");
    client.end();
  }

  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
