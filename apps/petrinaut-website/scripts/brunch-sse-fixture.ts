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
 * Pass `--recording=/path/to/export.petrinaut-actual.json` to replay an export
 * from Petrinaut's Actual > Events tab instead of generating dummy events. Each
 * `/stream` connection replays that export from the beginning and shifts
 * timestamped events so the first recorded transition happens at connection
 * time.
 *
 * This Brunch/Petrinaut interface is experimental: the event names, payload
 * shapes, and endpoint layout are only for this first integration pass. The
 * durable version will likely become a protocol owned by Petrinaut Core and
 * standardized with the Brunch team later.
 */

import { readFileSync } from "node:fs";
import http, { type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type {
  BrunchNetDefinitionInput,
  BrunchTransitionInput,
} from "../src/main/app/brunch-demo/brunch-protocol";
import type {
  ActualModeReceivedEvent,
  ActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";

type NumericMarking = Record<string, number>;

type SseFrame = {
  data: unknown;
  event: string;
};

type TimedSseFrame = SseFrame & {
  delayMs: number;
};

type RecordingReplay = {
  definition: BrunchNetDefinitionInput;
  events: ActualModeReceivedEvent[];
  initialState: NumericMarking;
  path: string;
  transitionFirings: ActualModeTransitionFiring[];
};

type ParsedArgs = {
  options: Map<string, string>;
  positionals: string[];
};

const readArgs = (): ParsedArgs => {
  const options = new Map<string, string>();
  const positionals: string[] = [];
  const rawArgs = process.argv.slice(2);

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]!;

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const normalizedArg = arg.slice(2);
    const equalsIndex = normalizedArg.indexOf("=");

    if (equalsIndex !== -1) {
      options.set(
        normalizedArg.slice(0, equalsIndex),
        normalizedArg.slice(equalsIndex + 1),
      );
      continue;
    }

    const nextArg = rawArgs[index + 1];

    if (nextArg && !nextArg.startsWith("--")) {
      options.set(normalizedArg, nextArg);
      index += 1;
    } else {
      options.set(normalizedArg, "true");
    }
  }

  return { options, positionals };
};

const { options: args, positionals } = readArgs();

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
const expandFilePath = (path: string): string => {
  const expandedPath =
    path === "~"
      ? homedir()
      : path.startsWith("~/")
        ? resolve(homedir(), path.slice(2))
        : path;

  return resolve(expandedPath);
};

const rawRecordingPath =
  args.get("recording") ??
  args.get("replay") ??
  process.env.RECORDING ??
  positionals[0];
const recordingPath = rawRecordingPath
  ? expandFilePath(rawRecordingPath)
  : undefined;
const runId = args.get("runId") ?? process.env.RUN_ID ?? "dummy-brunch-run";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonFile = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (err) {
    throw new Error(
      `Unable to load recording at ${path}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

const assertString = (
  value: unknown,
  message: string,
): asserts value is string => {
  if (typeof value !== "string") {
    throw new Error(message);
  }
};

const unwrapDefinitionData = (data: unknown): unknown =>
  isRecord(data) && "definition" in data ? data.definition : data;

const unwrapInitialStateData = (data: unknown): unknown =>
  isRecord(data) && "initialState" in data ? data.initialState : data;

const parseNumericMarking = (data: unknown, label: string): NumericMarking => {
  const candidate = unwrapInitialStateData(data);

  if (!isRecord(candidate)) {
    throw new Error(`Recording ${label} must be an object.`);
  }

  const marking: NumericMarking = {};

  for (const [placeId, value] of Object.entries(candidate)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Recording ${label}.${placeId} must be a finite number.`);
    }

    marking[placeId] = value;
  }

  return marking;
};

const parseTransitionEffect = (
  data: unknown,
  label: string,
): ActualModeTransitionFiring["input"] => {
  if (!isRecord(data)) {
    throw new Error(`Recording ${label} must be an object.`);
  }

  const effect: ActualModeTransitionFiring["input"] = {};

  for (const [placeId, value] of Object.entries(data)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Recording ${label}.${placeId} must be a finite number.`);
    }

    effect[placeId] = value;
  }

  return effect;
};

const parseTransitionFiring = (
  data: unknown,
  label: string,
): ActualModeTransitionFiring => {
  if (!isRecord(data)) {
    throw new Error(`Recording ${label} must be an object.`);
  }

  assertString(
    data.transitionId,
    `Recording ${label}.transitionId must be a string.`,
  );
  assertString(data.ts, `Recording ${label}.ts must be a string.`);

  if (!Number.isFinite(Date.parse(data.ts))) {
    throw new Error(`Recording ${label}.ts must be a valid timestamp.`);
  }

  return {
    transitionId: data.transitionId,
    input: parseTransitionEffect(data.input, `${label}.input`),
    output: parseTransitionEffect(data.output, `${label}.output`),
    ts: data.ts,
  };
};

const parseReceivedEventsRecording = (
  data: Record<string, unknown>,
): ActualModeReceivedEvent[] => {
  if (!Array.isArray(data.events)) {
    throw new Error("Recording events must be an array.");
  }

  return data.events.map((event, index) => {
    if (!isRecord(event)) {
      throw new Error(`Recording events[${index}] must be an object.`);
    }

    assertString(
      event.event,
      `Recording events[${index}].event must be a string.`,
    );

    return {
      event: event.event,
      data: event.data,
    };
  });
};

const toBrunchDefinitionInput = (data: unknown): BrunchNetDefinitionInput => {
  const candidate = unwrapDefinitionData(data);

  if (!isRecord(candidate)) {
    throw new Error("Recording definition must be an object.");
  }

  if (!Array.isArray(candidate.places)) {
    throw new Error("Recording definition.places must be an array.");
  }

  if (!Array.isArray(candidate.transitions)) {
    throw new Error("Recording definition.transitions must be an array.");
  }

  return {
    ...(typeof candidate.version === "number"
      ? { version: candidate.version }
      : {}),
    ...(isRecord(candidate.meta) ? { meta: candidate.meta } : {}),
    title: typeof candidate.title === "string" ? candidate.title : "Brunch run",
    places: candidate.places.map((place, index) => {
      if (!isRecord(place)) {
        throw new Error(
          `Recording definition.places[${index}] must be an object.`,
        );
      }

      assertString(
        place.id,
        `Recording definition.places[${index}].id must be a string.`,
      );

      return {
        id: place.id,
        name: typeof place.name === "string" ? place.name : place.id,
        ...(typeof place.x === "number" ? { x: place.x } : {}),
        ...(typeof place.y === "number" ? { y: place.y } : {}),
      };
    }),
    transitions: candidate.transitions.map((transition, transitionIndex) => {
      if (!isRecord(transition)) {
        throw new Error(
          `Recording definition.transitions[${transitionIndex}] must be an object.`,
        );
      }

      assertString(
        transition.id,
        `Recording definition.transitions[${transitionIndex}].id must be a string.`,
      );

      if (!Array.isArray(transition.inputArcs)) {
        throw new Error(
          `Recording definition.transitions[${transitionIndex}].inputArcs must be an array.`,
        );
      }

      if (!Array.isArray(transition.outputArcs)) {
        throw new Error(
          `Recording definition.transitions[${transitionIndex}].outputArcs must be an array.`,
        );
      }

      return {
        id: transition.id,
        name:
          typeof transition.name === "string" ? transition.name : transition.id,
        inputArcs: transition.inputArcs.map((arc, arcIndex) => {
          if (!isRecord(arc)) {
            throw new Error(
              `Recording definition.transitions[${transitionIndex}].inputArcs[${arcIndex}] must be an object.`,
            );
          }

          assertString(
            arc.placeId,
            `Recording definition.transitions[${transitionIndex}].inputArcs[${arcIndex}].placeId must be a string.`,
          );

          if (typeof arc.weight !== "number") {
            throw new Error(
              `Recording definition.transitions[${transitionIndex}].inputArcs[${arcIndex}].weight must be a number.`,
            );
          }

          return {
            placeId: arc.placeId,
            weight: arc.weight,
            type:
              arc.type === "read" || arc.type === "inhibitor"
                ? arc.type
                : "standard",
          };
        }),
        outputArcs: transition.outputArcs.map((arc, arcIndex) => {
          if (!isRecord(arc)) {
            throw new Error(
              `Recording definition.transitions[${transitionIndex}].outputArcs[${arcIndex}] must be an object.`,
            );
          }

          assertString(
            arc.placeId,
            `Recording definition.transitions[${transitionIndex}].outputArcs[${arcIndex}].placeId must be a string.`,
          );

          if (typeof arc.weight !== "number") {
            throw new Error(
              `Recording definition.transitions[${transitionIndex}].outputArcs[${arcIndex}].weight must be a number.`,
            );
          }

          return {
            placeId: arc.placeId,
            weight: arc.weight,
          };
        }),
        ...(typeof transition.x === "number" ? { x: transition.x } : {}),
        ...(typeof transition.y === "number" ? { y: transition.y } : {}),
      };
    }),
  };
};

const parseNormalizedRecording = (
  data: Record<string, unknown>,
): ActualModeReceivedEvent[] => {
  if (!Array.isArray(data.transitionFirings)) {
    throw new Error("Recording transitionFirings must be an array.");
  }

  return [
    { event: "definition", data: toBrunchDefinitionInput(data.definition) },
    {
      event: "initial_state",
      data: parseNumericMarking(data.initialState, "initialState"),
    },
    ...data.transitionFirings.map((firing, index) => ({
      event: "transition_firing",
      data: parseTransitionFiring(firing, `transitionFirings[${index}]`),
    })),
  ];
};

const parseRecordingEvents = (data: unknown): ActualModeReceivedEvent[] => {
  if (!isRecord(data)) {
    throw new Error("Recording root must be an object.");
  }

  if ("events" in data) {
    return parseReceivedEventsRecording(data);
  }

  if (
    "definition" in data &&
    "initialState" in data &&
    "transitionFirings" in data
  ) {
    return parseNormalizedRecording(data);
  }

  throw new Error(
    "Recording must be an Actual Events export with `events` or an older normalized recording.",
  );
};

const findFirstEvent = (
  events: ActualModeReceivedEvent[],
  eventName: string,
): ActualModeReceivedEvent | null =>
  events.find((event) => event.event === eventName) ?? null;

const parseRecordingReplay = (path: string): RecordingReplay => {
  const events = parseRecordingEvents(parseJsonFile(path));
  const definitionEvent = findFirstEvent(events, "definition");
  const initialStateEvent = findFirstEvent(events, "initial_state");

  if (!definitionEvent) {
    throw new Error("Recording is missing a definition event.");
  }

  if (!initialStateEvent) {
    throw new Error("Recording is missing an initial_state event.");
  }

  return {
    definition: toBrunchDefinitionInput(definitionEvent.data),
    events,
    initialState: parseNumericMarking(initialStateEvent.data, "initial_state"),
    path,
    transitionFirings: events.flatMap((event, index) =>
      event.event === "transition_firing"
        ? [parseTransitionFiring(event.data, `events[${index}].data`)]
        : [],
    ),
  };
};

const getEventTimestampMs = (event: ActualModeReceivedEvent): number | null => {
  if (!isRecord(event.data) || typeof event.data.ts !== "string") {
    return null;
  }

  const timestampMs = Date.parse(event.data.ts);

  if (!Number.isFinite(timestampMs)) {
    throw new Error(
      `Recording event ${event.event} has an invalid timestamp: ${event.data.ts}`,
    );
  }

  return timestampMs;
};

const retimeEventData = (data: unknown, deltaMs: number): unknown => {
  if (!isRecord(data) || typeof data.ts !== "string") {
    return data;
  }

  return {
    ...data,
    ts: new Date(Date.parse(data.ts) + deltaMs).toISOString(),
  };
};

const createTimedReplayFrames = (
  events: ActualModeReceivedEvent[],
  launchTimeMs: number,
): TimedSseFrame[] => {
  const firstTimestampMs = events
    .map((event) => getEventTimestampMs(event))
    .find((timestampMs) => timestampMs !== null);
  const deltaMs =
    firstTimestampMs !== undefined ? launchTimeMs - firstTimestampMs : 0;

  return events.map((event) => {
    const timestampMs = getEventTimestampMs(event);

    return {
      event: event.event,
      data: retimeEventData(event.data, deltaMs),
      delayMs:
        timestampMs === null
          ? 0
          : Math.max(0, timestampMs + deltaMs - launchTimeMs),
    };
  });
};

const applyFiringToMarking = (
  marking: NumericMarking,
  firing: ActualModeTransitionFiring,
): void => {
  for (const [placeId, value] of Object.entries(firing.input)) {
    marking[placeId] = (marking[placeId] ?? 0) - value;
  }

  for (const [placeId, value] of Object.entries(firing.output)) {
    marking[placeId] = (marking[placeId] ?? 0) + value;
  }
};

const defaultDefinition: BrunchNetDefinitionInput = {
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

const defaultInitialState: NumericMarking = {
  ideas: 100,
  queued: 0,
  implementing: 0,
  reviewing: 0,
  done: 0,
};

const recordingReplay = recordingPath
  ? parseRecordingReplay(recordingPath)
  : null;

const definition = recordingReplay?.definition ?? defaultDefinition;
const initialState = recordingReplay?.initialState ?? defaultInitialState;

const transitionById = new Map(
  definition.transitions.map((transition) => [transition.id, transition]),
);

const cloneMarking = (marking: NumericMarking): NumericMarking => ({
  ...marking,
});

const getTransition = (transitionId: string): BrunchTransitionInput => {
  const transition = transitionById.get(transitionId);

  if (!transition) {
    throw new Error(`Unknown transition: ${transitionId}`);
  }

  return transition;
};

const canFire = (marking: NumericMarking, transitionId: string): boolean => {
  const transition = getTransition(transitionId);

  return transition.inputArcs.every(
    (arc) => (marking[arc.placeId] ?? 0) >= arc.weight,
  );
};

const applyTransition = (
  marking: NumericMarking,
  transitionId: string,
): ActualModeTransitionFiring => {
  const transition = getTransition(transitionId);
  const input: ActualModeTransitionFiring["input"] = {};
  const output: ActualModeTransitionFiring["output"] = {};

  for (const arc of transition.inputArcs) {
    if ((arc.type ?? "standard") !== "standard") {
      continue;
    }

    input[arc.placeId] = (input[arc.placeId] ?? 0) + arc.weight;
    marking[arc.placeId] = (marking[arc.placeId] ?? 0) - arc.weight;
  }

  for (const arc of transition.outputArcs) {
    output[arc.placeId] = (output[arc.placeId] ?? 0) + arc.weight;
    marking[arc.placeId] = (marking[arc.placeId] ?? 0) + arc.weight;
  }

  return {
    transitionId,
    input,
    output,
    ts: new Date().toISOString(),
  };
};

const currentMarking = cloneMarking(initialState);
const transitionFirings: ActualModeTransitionFiring[] = recordingReplay
  ? recordingReplay.transitionFirings.map((firing) => ({ ...firing }))
  : [];
const replayFrames: SseFrame[] = [
  { event: "definition", data: definition },
  { event: "initial_state", data: initialState },
];

const appendFiring = (transitionId: string): ActualModeTransitionFiring => {
  const firing = applyTransition(currentMarking, transitionId);

  transitionFirings.push(firing);
  replayFrames.push({ event: "transition_firing", data: firing });

  return firing;
};

if (recordingReplay) {
  for (const firing of recordingReplay.transitionFirings) {
    applyFiringToMarking(currentMarking, firing);
  }
} else {
  for (const transitionId of [
    "plan_task",
    "start_implementation",
    "plan_task",
    "submit_review",
    "merge_change",
  ]) {
    appendFiring(transitionId);
  }
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

const nextLiveFiring = (): ActualModeTransitionFiring => {
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

const clients = new Map<ServerResponse, ReturnType<typeof setTimeout>[]>();

const addClient = (
  response: ServerResponse,
): ReturnType<typeof setTimeout>[] => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  clients.set(response, timers);

  return timers;
};

const closeClient = (response: ServerResponse): void => {
  const timers = clients.get(response);

  if (timers) {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  }

  clients.delete(response);
};

const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
const endpoint = `http://${publicHost}:${port}/stream`;
const encodedEndpoint = encodeURIComponent(endpoint);
const brunchRoute = `/brunch?mode=actual&sse=${encodedEndpoint}&runId=${encodeURIComponent(
  runId,
)}`;
const brunchEndpointRoute = `/brunch?brunch_endpoint=${encodedEndpoint}`;
const snapshotUrl = `http://${publicHost}:${port}/snapshot`;

const replayRecordingToClient = (
  response: ServerResponse,
  recording: RecordingReplay,
): void => {
  const timers = clients.get(response);

  if (!timers) {
    return;
  }

  const frames = createTimedReplayFrames(recording.events, Date.now());
  let lastDelayMs = 0;

  for (const frame of frames) {
    lastDelayMs = Math.max(lastDelayMs, frame.delayMs);

    const sendFrame = () => {
      streamFrame(response, frame.event, frame.data);

      if (
        frame.event === "transition_firing" &&
        isRecord(frame.data) &&
        typeof frame.data.transitionId === "string" &&
        typeof frame.data.ts === "string"
      ) {
        console.log(
          `[${frame.data.ts}] replay transition_firing ${frame.data.transitionId}`,
        );
      }
    };

    if (frame.delayMs === 0) {
      sendFrame();
    } else {
      timers.push(setTimeout(sendFrame, frame.delayMs));
    }
  }

  timers.push(
    setTimeout(() => {
      streamFrame(response, "terminal", {
        reason: "recording_replay_complete",
      });
      response.end();
    }, lastDelayMs + 50),
  );
};

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
    addClient(response);

    if (recordingReplay) {
      replayRecordingToClient(response, recordingReplay);
    } else {
      for (const frame of replayFrames) {
        streamFrame(response, frame.event, frame.data);
      }
    }

    request.on("close", () => {
      closeClient(response);
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
          mode: recordingReplay ? "recording-replay" : "generated",
          recordingPath: recordingReplay?.path ?? null,
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
      recordingReplay
        ? `Replaying recording: ${recordingReplay.path}`
        : "Generated fixture mode.",
      recordingReplay
        ? "Each /stream connection replays definition, initial_state, and retimed transition_firing events from the beginning."
        : "Connect to /stream to receive definition, initial_state, previous transition_firing events, then live transition_firing events.",
    ].join("\n"),
  );
});

const broadcastLiveFiring = (): void => {
  const firing = nextLiveFiring();

  for (const client of clients.keys()) {
    streamFrame(client, "transition_firing", firing);
  }

  console.log(
    `[${firing.ts}] transition_firing ${firing.transitionId} -> ${JSON.stringify(
      firing.output,
    )}`,
  );
};

server.on("error", (err: Error & { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use on ${host}. Stop the existing fixture or pass another port, for example:`,
    );
    console.error(
      "  yarn workspace @apps/petrinaut-website brunch:fixture -- --port=5185",
    );
    process.exit(1);
  }

  throw err;
});

server.listen(port, host, () => {
  console.log("Dummy Brunch SSE fixture running");
  console.log("");
  console.log(`SSE endpoint: ${endpoint}`);
  console.log(`Petrinaut route: ${brunchRoute}`);
  console.log(`Petrinaut brunch_endpoint route: ${brunchEndpointRoute}`);
  console.log(`Snapshot JSON: ${snapshotUrl}`);
  console.log("");
  if (recordingReplay) {
    console.log(`Replaying recording: ${recordingReplay.path}`);
    console.log(
      `Recorded transition events: ${recordingReplay.transitionFirings.length}`,
    );
    console.log(
      "Each /stream connection replays from the beginning with retimed timestamps.",
    );
  } else {
    console.log(`Streaming live transitions every ${intervalMs}ms.`);
  }
  console.log("Stop with Ctrl-C.");
});

const interval = recordingReplay
  ? null
  : setInterval(broadcastLiveFiring, intervalMs);

const shutdown = (): void => {
  if (interval) {
    clearInterval(interval);
  }

  for (const client of clients.keys()) {
    streamComment(client, "fixture shutting down");
    client.end();
    closeClient(client);
  }

  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
