import { expect, test } from "vitest";

import { resolvePetrinautSessionIdentity } from "../src/elicitation-session.ts";

test("namespaces panel sessions by principal while keeping one document per principal", () => {
  const firstSession = resolvePetrinautSessionIdentity(
    "principal-a",
    "conversation-shared",
  );
  const reloadedSession = resolvePetrinautSessionIdentity(
    "principal-a",
    "conversation-after-reload",
  );
  const otherPrincipal = resolvePetrinautSessionIdentity(
    "principal-b",
    "conversation-shared",
  );

  expect(reloadedSession.targetDocumentId).toBe(firstSession.targetDocumentId);
  expect(reloadedSession.sessionId).not.toBe(firstSession.sessionId);
  expect(otherPrincipal.sessionId).not.toBe(firstSession.sessionId);
  expect(otherPrincipal.targetDocumentId).not.toBe(
    firstSession.targetDocumentId,
  );
});
