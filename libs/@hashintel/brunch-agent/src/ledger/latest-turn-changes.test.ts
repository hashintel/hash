import { expect, test } from "vitest";

import { ledgerCommentsMessage } from "./comments";
import { latestTurnChanges } from "./latest-turn-changes";

import type { LedgerHistoryMessage } from "./commits";

const user = (id: string, text: string): LedgerHistoryMessage => ({
  id,
  role: "user",
  purpose: "user",
  parts: [{ type: "text", text }],
});

/** A comment batch as Flue's history projects the delivered signal. */
const commentBatch = (id: string, text: string): LedgerHistoryMessage => {
  const message = ledgerCommentsMessage([{ id, records: ["e1"], text }]);
  return {
    id,
    role: "system",
    purpose: "dispatch",
    signal: { tagName: message.tagName },
    parts: [{ type: "text", text: message.body }],
  };
};

const reply = (id: string): LedgerHistoryMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: "Noted." }],
});

const call = (
  toolCallId: string,
  entries: unknown[],
  ids: string[],
  overrides: Record<string, unknown> = {},
): LedgerHistoryMessage => ({
  id: `assistant-${toolCallId}`,
  role: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "ledger_commit",
      toolCallId,
      state: "output-available",
      input: { entries },
      output: { status: "recorded", commitId: toolCallId, revision: 1, ids },
      ...overrides,
    },
  ],
});

const reservoir = {
  name: "Reservoir",
  kind: "resource",
  origin: "stated",
  status: "confirmed",
};
const pump = { ...reservoir, name: "Pump" };

const claim = (text: string, supersedes?: string[]) => [
  "claim/create",
  {
    text,
    entities: ["e1"],
    origin: "stated",
    status: "confirmed",
    ...(supersedes ? { supersedes } : {}),
  },
];

const changes = (...messages: LedgerHistoryMessage[]) =>
  Object.fromEntries(latestTurnChanges({ messages }));

const firstTurn = [
  user("user-1", "The reservoir holds a day of supply."),
  call("commit-1", [["entity/create", reservoir]], ["e1"]),
];

test("the latest turn's accepted changes accumulate across its commits, and a later turn clears them", () => {
  expect(changes(...firstTurn)).toEqual({ e1: "added" });

  const secondTurn = [...firstTurn, user("user-2", "A pump fills it.")];
  expect(changes(...secondTurn)).toEqual({});

  const pumpAdded = [
    ...secondTurn,
    call("commit-2", [["entity/create", pump]], ["e2"]),
  ];
  expect(changes(...pumpAdded)).toEqual({ e2: "added" });

  const renamed = [
    ...pumpAdded,
    call(
      "commit-3",
      [
        ["entity/update/e1", { ...reservoir, name: "Hillcrest reservoir" }],
        claim("The pump fills the reservoir overnight."),
      ],
      ["e1", "c1"],
    ),
  ];
  expect(changes(...renamed)).toEqual({
    e1: "updated",
    e2: "added",
    c1: "added",
  });

  expect(
    changes(...renamed, user("user-3", "Thanks."), reply("reply-3")),
  ).toEqual({});
});

test("calls that recorded nothing contribute nothing", () => {
  const create = [["entity/create", pump]];
  expect(
    changes(
      ...firstTurn,
      user("user-2", "A pump fills it."),
      call("refused", create, [], {
        output: {
          status: "refused",
          applied: false,
          code: "unknown-address",
          message: "No such record.",
          revision: 1,
        },
      }),
      call("pending", create, [], {
        state: "input-available",
        output: undefined,
      }),
      call("failed", create, [], { state: "output-error", output: undefined }),
      call("malformed", create, ["e7"]),
    ),
  ).toEqual({});
});

test("only net changes count: a no-op update or one undone within the turn is not a change", () => {
  expect(
    changes(
      ...firstTurn,
      user("user-2", "Nothing about the reservoir changed."),
      call("same", [["entity/update/e1", reservoir]], ["e1"]),
      call(
        "thing",
        [["entity/update/e1", { ...reservoir, kind: "thing" }]],
        ["e1"],
      ),
      call("back", [["entity/update/e1", reservoir]], ["e1"]),
      call("pump", [["entity/create", pump]], ["e2"]),
      call(
        "pump-renamed",
        [["entity/update/e2", { ...pump, name: "Booster pump" }]],
        ["e2"],
      ),
    ),
  ).toEqual({ e2: "added" });
});

test("a replacement claim is updated, a claim replaced within the turn is new; superseded claims are not marked", () => {
  expect(
    changes(
      ...firstTurn,
      call("claim", [claim("It holds a day of supply.")], ["c1"]),
      user("user-2", "It holds two days, actually three."),
      call("two-days", [claim("It holds two days of supply.", ["c1"])], ["c2"]),
      call(
        "three-days",
        [claim("It holds three days of supply.", ["c2"])],
        ["c3"],
      ),
      call("fresh", [claim("It is refilled nightly.")], ["c4"]),
      call("fresh-replaced", [claim("It is refilled at 2am.", ["c4"])], ["c5"]),
    ),
  ).toEqual({ c3: "updated", c5: "added" });
});

test("an entity moved out of scope is updated", () => {
  expect(
    changes(
      ...firstTurn,
      user("user-2", "Leave the reservoir out."),
      call(
        "exclude",
        [["entity/update/e1", { ...reservoir, status: "out-of-scope" }]],
        ["e1"],
      ),
    ),
  ).toEqual({ e1: "updated" });
});

test("an obligation met in the turn is updated beside its fulfilling reflection; one created and met in the turn is new", () => {
  expect(
    changes(
      ...firstTurn,
      call(
        "owed",
        [
          [
            "obligation/create",
            { text: "A run reproduces the overnight fill.", entities: ["e1"] },
          ],
        ],
        ["o1"],
      ),
      user("user-2", "Run it."),
      call(
        "met",
        [
          [
            "reflection/create",
            { text: "The run reproduced it.", discharges: ["o1"] },
          ],
          [
            "obligation/create",
            { text: "A run at double demand drains it.", entities: ["e1"] },
          ],
          [
            "reflection/create",
            { text: "The double-demand run drained it.", discharges: ["$1"] },
          ],
        ],
        ["r1", "o2", "r2"],
      ),
    ),
  ).toEqual({ r1: "added", o1: "updated", o2: "added", r2: "added" });
});

test("a comment batch opens a turn like a message", () => {
  const commented = [
    ...firstTurn,
    commentBatch("n1", "It is a pump, not a store."),
  ];
  expect(changes(...commented)).toEqual({});
  expect(
    changes(
      ...commented,
      call(
        "kind",
        [["entity/update/e1", { ...reservoir, kind: "activity" }]],
        ["e1"],
      ),
    ),
  ).toEqual({ e1: "updated" });
});

test("a Retry submission opens a new turn even with the same words", () => {
  const added = [
    ...firstTurn,
    user("user-2", "A pump fills it."),
    call("pump", [["entity/create", pump]], ["e2"]),
  ];
  const retried = [...added, user("user-3", "A pump fills it.")];
  expect(changes(...retried)).toEqual({});
  expect(
    changes(
      ...retried,
      call(
        "pump-renamed",
        [["entity/update/e2", { ...pump, name: "Booster pump" }]],
        ["e2"],
      ),
    ),
  ).toEqual({ e2: "updated" });
});
