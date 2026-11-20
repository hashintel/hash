import { useEffect, useMemo } from "react";

import {
  createHandEditReporter,
  type HandEditRefusal,
  type ReportedBrowserCalls,
} from "../../client/hand-edits/hand-edit-reporter";
import { readShownRevision } from "../../client/hand-edits/shown-revision";
import { documentRevisionOf } from "../tools/shared/document-revision";

import type { SuccessorConversation } from "../../client/successor/successor-endpoints";
import type { BrowserContext } from "@hashintel/brunch-agent";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";

/**
 * Report the user's hand edits of the bound document to the durable agents
 * server while the panel shows it, and return the panel's browser calls with
 * each claim preceded by a report and reports held while each call runs.
 * Off the durable agents server, nothing is reported and `browserCalls`
 * comes back as it is. Pass a stable `onRefused`.
 */
export const useHandEditReports = <Calls extends ReportedBrowserCalls>({
  conversation,
  binding,
  handle,
  browserCalls,
  onRefused,
}: {
  readonly conversation: SuccessorConversation | null;
  /** The panel's document binding, the one its chat transport sends. */
  readonly binding: BrowserContext["binding"] | null;
  /** The bound document's handle, or `null` while it loads. */
  readonly handle: PetrinautDocHandle | null;
  readonly browserCalls: Calls | undefined;
  readonly onRefused: (refusal: HandEditRefusal) => void;
}): Calls | undefined => {
  const reporter = useMemo(
    () =>
      conversation === null || binding === null || handle === null
        ? undefined
        : createHandEditReporter({
            conversation,
            binding,
            document: {
              subscribe: (listener) => handle.subscribe(listener),
              revision: () => {
                const definition = handle.doc();
                return definition === undefined
                  ? undefined
                  : documentRevisionOf(definition);
              },
            },
            readShown: (signal) => readShownRevision(conversation, signal),
            onRefused,
          }),
    [conversation, binding, handle, onRefused],
  );
  useEffect(() => reporter?.start(), [reporter]);
  return useMemo(
    () =>
      reporter === undefined || browserCalls === undefined
        ? browserCalls
        : reporter.reportAround(browserCalls),
    [reporter, browserCalls],
  );
};
