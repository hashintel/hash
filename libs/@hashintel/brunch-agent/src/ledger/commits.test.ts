import { expect, test } from "vitest";

import { foldCommits } from "./commits";

test("a reflection recorded on a `subnet` is folded as one on a component, with the rest of its commit", () => {
  const { state, rejected } = foldCommits({
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Every desk works the same way." }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "ledger_commit",
            toolCallId: "ledger-1",
            state: "output-available",
            input: {
              entries: [
                [
                  "entity/create",
                  {
                    name: "Desk",
                    kind: "location",
                    origin: "stated",
                    status: "confirmed",
                  },
                ],
                [
                  "reflection/create",
                  {
                    text: "One net stands for every desk.",
                    netElements: [
                      { kind: "subnet", id: "desk" },
                      { kind: "place", id: "queue" },
                    ],
                    entities: ["$0"],
                  },
                ],
              ],
            },
            output: {
              status: "recorded",
              commitId: "ledger-1",
              revision: 1,
              ids: ["e1", "r1"],
            },
          },
        ],
      },
    ],
  });

  expect(rejected).toEqual([]);
  expect(state.entities.map(({ address }) => address)).toEqual(["e1"]);
  expect(state.reflections).toMatchObject([
    {
      address: "r1",
      netElements: [
        { kind: "component", id: "desk" },
        { kind: "place", id: "queue" },
      ],
    },
  ]);
});
