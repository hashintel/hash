import type { SentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { proxySinks, setHandler } from "@temporalio/workflow";

import { getExternalInputResponseQuery } from "../../shared/queries";
import { externalInputRequestSignal } from "../../shared/signals";

const sinks = proxySinks<SentrySinks>();

/**
 * Handle requests from activities for external input (e.g. human input, HTML from a browser authenticated with a
 * site).
 *
 * The process by which these requests and responses occur is:
 * 1. Activity sends a Signal to the Workflow requesting data from the outside world when it encounters a need for it
 * 2. The outside world is polling for these requests (resolved by finding the signals in the event history, for now)
 * 3. The outside world sends a Signal back to the Workflow with the requested data
 * 4. The Workflow allows the response to be accessed via a Query
 */
export const setQueryAndSignalHandlers = () => {
  const externalInputRequestsById = new Map<
    string,
    {
      request: ExternalInputRequestSignal;
      response?: ExternalInputResponseSignal;
    }
  >();

  setHandler(
    externalInputRequestSignal,
    (request: ExternalInputRequestSignal) => {
      if (!externalInputRequestsById.has(request.requestId)) {
        externalInputRequestsById.set(request.requestId, { request });
      }
    },
  );

  setHandler(
    externalInputResponseSignal,
    (response: ExternalInputResponseSignal) => {
      const { requestId } = response;
      const inputRequestRecord = externalInputRequestsById.get(requestId);

      if (!inputRequestRecord) {
        /**
         * It's not clear in what circumstances this will happen, and we can't do much about it,
         * but we should log it to be aware if it is happening.
         */
        sinks.sentry.captureException(
          new Error(
            `Received response for external input request ${requestId}, but no record of request was found`,
          ),
        );
        return;
      }

      if (response.type !== inputRequestRecord.request.type) {
        sinks.sentry.captureException(
          new Error(
            `Response for external input request ${requestId} has type ${response.type}, but expected ${inputRequestRecord.request.type}`,
          ),
        );
        return;
      }

      inputRequestRecord.response = response;
    },
  );

  setHandler(getExternalInputResponseQuery, ({ requestId }) => {
    const inputRequestRecord = externalInputRequestsById.get(requestId);
    if (!inputRequestRecord) {
      /**
       * We can throw an error here to crash the activity, since it is waiting for a response it will never receive.
       *
       */
      throw new Error(
        `Received query for response to external input request ${requestId}, but no record of request was found`,
      );
    }

    return inputRequestRecord.response ?? null;
  });
};
