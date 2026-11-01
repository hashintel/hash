import {
  proxyActivities,
  proxySinks,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";

import { getExternalInputResponseQuery } from "../../shared/queries.js";
import { externalInputRequestSignal } from "../../shared/signals.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { createCommonFlowActivities } from "@local/hash-backend-utils/flows/process-flow-workflow/common-activities";
import type { SentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import type {
  ExternalInputRequest,
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "@local/hash-isomorphic-utils/flows/types";

const sinks = proxySinks<SentrySinks>();

/** Retried until it succeeds, as lists show a run's open input requests only once they're saved. */
const { saveOpenInputRequestsActivity } = proxyActivities<
  ReturnType<typeof createCommonFlowActivities>
>({
  startToCloseTimeout: "60 second",
  retry: {
    maximumInterval: "1 minute",
  },
});

/**
 * Handle requests from activities for external input (e.g. human input, HTML from a browser authenticated with a
 * site).
 *
 * The process by which these requests and responses occur is:
 * 1. Activity sends a Signal to the Workflow requesting data from the outside world when it encounters a need for it
 * 2. The outside world is polling for these requests (resolved by finding the signals in the event history, for now)
 * 3. The outside world sends a Signal back to the Workflow with the requested data
 * 4. The Workflow allows the response to be accessed via a Query
 *
 * The requests that haven't been answered are saved on the run's entity as they change, for lists of runs to show.
 */
export const setQueryAndSignalHandlers = ({
  userAuthentication,
}: {
  userAuthentication: { actorId: ActorEntityUuid };
}) => {
  const externalInputRequestsById = new Map<
    string,
    {
      request: ExternalInputRequestSignal;
      raisedAt: string;
      response?: ExternalInputResponseSignal;
    }
  >();

  let savingOpenInputRequests = Promise.resolve();
  let openInputRequestsSaveQueued = false;

  /**
   * Saves happen one at a time, each with the requests open when it starts, so a save queued behind another covers
   * every change made in the meantime.
   */
  const saveOpenInputRequests = () => {
    if (openInputRequestsSaveQueued) {
      return;
    }

    openInputRequestsSaveQueued = true;

    savingOpenInputRequests = savingOpenInputRequests.then(async () => {
      openInputRequestsSaveQueued = false;

      const openInputRequests: ExternalInputRequest[] = [
        ...externalInputRequestsById.values(),
      ]
        .filter(({ response }) => !response)
        .map(({ request, raisedAt }) => ({ ...request, raisedAt }))
        .reverse();

      try {
        await saveOpenInputRequestsActivity({
          openInputRequests,
          temporalWorkflowId: workflowInfo().workflowId,
          userAuthentication,
        });
      } catch (error) {
        sinks.sentry.captureException(error);
      }
    });
  };

  setHandler(
    externalInputRequestSignal,
    (request: ExternalInputRequestSignal) => {
      if (!externalInputRequestsById.has(request.requestId)) {
        externalInputRequestsById.set(request.requestId, {
          request,
          raisedAt: new Date().toISOString(),
        });
        saveOpenInputRequests();
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

      const firstResponse = !inputRequestRecord.response;
      inputRequestRecord.response = response;

      if (firstResponse) {
        saveOpenInputRequests();
      }
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
