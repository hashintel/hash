import { describe, expect, test } from "vitest";

import { brunchTools, durableHistoryPartTypes } from "@hashintel/brunch-agent";

import { shownRevisionOf } from "./shown-revision";

import type { SuccessorBrowserCall } from "../successor/successor-browser-calls";
import type { UIMessage } from "ai";

const readBack = { places: [], transitions: [], arcs: [] };

/** A browser call's record, as `GET …/browser-calls` lists it. */
const record = (
  toolCallId: string,
  toolName: string,
  status: SuccessorBrowserCall["status"],
  documentRevision: { before?: string; after?: string },
): SuccessorBrowserCall => ({
  toolCallId,
  toolName,
  input: {},
  status,
  output: { applied: true },
  metadata: {
    documentRevision,
    ...(documentRevision.after === undefined ? {} : { readBack }),
  },
  expiresAt: 0,
  admittable: false,
});

/** A browser call's part in history, as the model's turn left it. */
const toolPart = (
  toolCallId: string,
  toolName: string,
  state:
    | "output-available"
    | "output-error"
    | "input-available" = "output-available",
): UIMessage["parts"][number] =>
  state === "output-available"
    ? {
        type: "dynamic-tool",
        toolName,
        toolCallId,
        state,
        input: {},
        output: { applied: true },
      }
    : state === "output-error"
      ? {
          type: "dynamic-tool",
          toolName,
          toolCallId,
          state,
          input: {},
          errorText: "failed",
        }
      : { type: "dynamic-tool", toolName, toolCallId, state, input: {} };

const notePart = (revision: string): UIMessage["parts"][number] => ({
  type: durableHistoryPartTypes.handEdit,
  data: { episode: "episode", reportId: "episode:0", revision },
});

const turn = (
  id: string,
  ...parts: UIMessage["parts"]
): readonly UIMessage[] => [
  { id: `user-${id}`, role: "user", parts: [{ type: "text", text: "Go." }] },
  { id: `durable:${id}`, role: "assistant", parts },
];

describe("shownRevisionOf", () => {
  test("a change shows the revision it produced, and a read the one it observed", () => {
    const calls = [
      record("change-1", "addPlace", "settled", { before: "r1", after: "r2" }),
      record("read-1", "readNetStructure", "settled", { before: "r3" }),
    ];

    expect(
      shownRevisionOf(turn("1", toolPart("change-1", "addPlace")), calls),
    ).toBe("r2");
    expect(
      shownRevisionOf(
        [
          ...turn("1", toolPart("change-1", "addPlace")),
          ...turn("2", toolPart("read-1", "readNetStructure")),
        ],
        calls,
      ),
    ).toBe("r3");
  });

  test("a hand-edit note after the latest view names the revision the model was told of", () => {
    const calls = [
      record("change-1", "addPlace", "settled", { before: "r1", after: "r2" }),
    ];
    const history = [
      ...turn("1", toolPart("change-1", "addPlace")),
      { id: "brunch.hand-edit:e:0", role: "user", parts: [notePart("r3")] },
    ] satisfies UIMessage[];

    expect(shownRevisionOf(history, calls)).toBe("r3");
  });

  test("a note inside a response counts where it landed among the response's calls", () => {
    const calls = [
      record("change-1", "addPlace", "settled", { before: "r1", after: "r2" }),
      record("change-2", "addPlace", "settled", { before: "r3", after: "r4" }),
    ];

    expect(
      shownRevisionOf(
        turn("1", toolPart("change-1", "addPlace"), notePart("r3")),
        calls,
      ),
    ).toBe("r3");
    expect(
      shownRevisionOf(
        turn(
          "1",
          toolPart("change-1", "addPlace"),
          notePart("r3"),
          toolPart("change-2", "addPlace"),
        ),
        calls,
      ),
    ).toBe("r4");
  });

  test("a result the model never read shows nothing: a discarded call, a failure, a call still waiting", () => {
    const shown = record("change-1", "addPlace", "settled", {
      before: "r1",
      after: "r2",
    });
    const history = (part: UIMessage["parts"][number]) => [
      ...turn("1", toolPart("change-1", "addPlace")),
      ...turn("2", part),
    ];

    expect(
      shownRevisionOf(history(toolPart("change-2", "addPlace")), [
        shown,
        record("change-2", "addPlace", "discarded", {
          before: "r2",
          after: "r3",
        }),
      ]),
    ).toBe("r2");
    expect(
      shownRevisionOf(
        history(toolPart("change-2", "addPlace", "output-error")),
        [shown, record("change-2", "addPlace", "failure-settled", {})],
      ),
    ).toBe("r2");
    expect(
      shownRevisionOf(
        history(toolPart("change-2", "addPlace", "input-available")),
        [shown, record("change-2", "addPlace", "claimed", {})],
      ),
    ).toBe("r2");
  });

  test("a call that shows no net, or a change without its read-back, leaves the view as it was", () => {
    const calls = [
      record("change-1", "addPlace", "settled", { before: "r1", after: "r2" }),
      {
        ...record("change-2", "addPlace", "settled", {
          before: "r2",
          after: "r3",
        }),
        metadata: { documentRevision: { before: "r2", after: "r3" } },
      },
      record("query-1", brunchTools.hashQueryEntities, "settled", {
        before: "r9",
      }),
    ];

    expect(
      shownRevisionOf(
        turn(
          "1",
          toolPart("change-1", "addPlace"),
          toolPart("change-2", "addPlace"),
          toolPart("query-1", brunchTools.hashQueryEntities),
        ),
        calls,
      ),
    ).toBe("r2");
  });

  test("a conversation that never showed the model the net shows no revision", () => {
    expect(
      shownRevisionOf(
        [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Hi." }],
          },
        ],
        [],
      ),
    ).toBeUndefined();
  });
});
