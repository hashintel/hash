import { expect, test } from "vitest";

import { processAgentBindingFor } from "./process-agent-binding";

test("repeats the net id as incarnationId for servers that require it", () => {
  expect(processAgentBindingFor("net", "conversation")).toEqual({
    conversationId: "conversation",
    documentId: "net",
    incarnationId: "net",
  });
});
