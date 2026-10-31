import { resolvePayloadValue } from "../payload-storage.js";

import type { ResolvePayloadContext } from "../payload-storage.js";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

const resolveStoredPayloadsInOutputs = (
  outputs: StepOutput[],
  context: ResolvePayloadContext,
): Promise<StepOutput[]> =>
  Promise.all(
    outputs.map(
      async (output) =>
        ({
          ...output,
          payload: {
            kind: output.payload.kind,
            value: await resolvePayloadValue(
              context,
              output.payload.kind,
              output.payload.value,
            ),
          },
        }) as StepOutput,
    ),
  );

/**
 * Events with the payloads their step and flow outputs stored elsewhere in place of their references. Step inputs
 * are left as they are.
 */
export const resolveStoredPayloadsInEvents = (
  events: FlowRunEvent[],
  context: ResolvePayloadContext,
): Promise<FlowRunEvent[]> =>
  Promise.all(
    events.map(async (event) => {
      if (event.kind === "attemptSucceeded") {
        return {
          ...event,
          outputs: await resolveStoredPayloadsInOutputs(event.outputs, context),
        };
      }

      if (event.kind === "runFinished" && event.flowOutputs) {
        return {
          ...event,
          flowOutputs: await resolveStoredPayloadsInOutputs(
            event.flowOutputs,
            context,
          ),
        };
      }

      return event;
    }),
  );
