/** Host-owned wiring for the local Flue binding's history transport and store. */

import {
  createFlueHistoryReader,
  createLocalCaptureStore,
  type ElicitationSession,
  type FlueHistoryReaderOptions,
} from "@hashintel/brunch-agent-binding-flue";

import { GHERKIN_AGENT_ROUTE } from "./routes.ts";
import { targetDocumentPath } from "./target-document-path.ts";

const appTransport: FlueHistoryReaderOptions["transport"] = async (
  input,
  init,
) => {
  const { default: app } = await import("./app.ts");
  return app.fetch(input instanceof Request ? input : new Request(input, init));
};

export const createGherkinElicitationSession = (
  sessionId: string,
  targetDocumentId: string,
): ElicitationSession => {
  const captureStore = createLocalCaptureStore(
    targetDocumentPath(targetDocumentId),
  );
  return {
    sessionId,
    captureStore,
    historyReader: createFlueHistoryReader({
      resolveConversationUrl: (id) =>
        `http://brunch.local/agents/${GHERKIN_AGENT_ROUTE}/${id}`,
      transport: appTransport,
      archive: captureStore,
    }),
  };
};
