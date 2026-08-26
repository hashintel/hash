/** Host-owned wiring for the local Flue binding's history transport and store. */

import {
  createFlueHistoryReader,
  createLocalCaptureStore,
  type ElicitationSession,
  type FlueHistoryReaderOptions,
} from "@hashintel/brunch-agent-binding-flue";

import { AGENT_ROUTES, type AgentTarget } from "./routes.ts";
import { targetDocumentPath } from "./target-document-path.ts";

const appTransport: FlueHistoryReaderOptions["transport"] = async (
  input,
  init,
) => {
  const { default: app } = await import("./app.ts");
  return app.fetch(input instanceof Request ? input : new Request(input, init));
};

/**
 * One session factory per target agent. The history reader resolves
 * conversations through the agent's own route, so each target gets a
 * named creator rather than a shared one that guesses the route.
 */
const createElicitationSession = (
  target: AgentTarget,
  sessionId: string,
  targetDocumentId: string,
  ownerKey?: string,
): ElicitationSession => {
  const captureStore = createLocalCaptureStore(
    targetDocumentPath(targetDocumentId),
    ownerKey === undefined ? {} : { ownerKey },
  );
  return {
    sessionId,
    captureStore,
    historyReader: createFlueHistoryReader({
      resolveConversationUrl: (id) =>
        `http://brunch.local/agents/${AGENT_ROUTES[target]}/${id}`,
      transport: appTransport,
      archive: captureStore,
    }),
  };
};

export const createGherkinElicitationSession = (
  sessionId: string,
  targetDocumentId: string,
  ownerKey?: string,
): ElicitationSession =>
  createElicitationSession("gherkin", sessionId, targetDocumentId, ownerKey);

export const createSdcpnElicitationSession = (
  sessionId: string,
  targetDocumentId: string,
  ownerKey?: string,
): ElicitationSession =>
  createElicitationSession("sdcpn", sessionId, targetDocumentId, ownerKey);
