import { expect, test } from "vitest";

import { parseDurableHistoryMessageMetadata } from "./durable-history-metadata";

import type { VersionLoad } from "../petrinaut/submission-context";
import type { PetrinautAiMessageMetadata } from "../ui/chat/ai-assistant-panel/types";

test("a response's outcome parses as the panel's own terminal markers", () => {
  const stopped: PetrinautAiMessageMetadata =
    parseDurableHistoryMessageMetadata({ stopped: true });
  const failed: PetrinautAiMessageMetadata = parseDurableHistoryMessageMetadata(
    { failed: true },
  );
  expect(stopped).toEqual({ stopped: true });
  expect(failed).toEqual({ failed: true });
});

test("a user's input parses with why it never ran and the version load it carried", () => {
  const versionLoad: VersionLoad = {
    id: "version-1",
    decisionTime: "2026-11-12T09:30:00.000Z",
  };
  expect(
    parseDurableHistoryMessageMetadata({ withdrawn: "failed", versionLoad }),
  ).toEqual({ withdrawn: "failed", versionLoad });
  expect(
    parseDurableHistoryMessageMetadata({ withdrawn: "stopped" }).withdrawn,
  ).toBe("stopped");
});

test("an outcome other than the contract's is refused, and a key it does not name is dropped", () => {
  expect(() => parseDurableHistoryMessageMetadata({ stopped: false })).toThrow(
    /Expected true/,
  );
  expect(() =>
    parseDurableHistoryMessageMetadata({ withdrawn: "aborted" }),
  ).toThrow(/received "aborted"/);
  expect(
    parseDurableHistoryMessageMetadata({ failed: true, later: "field" }),
  ).toEqual({ failed: true });
});
