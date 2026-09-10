import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, isAbsolute, join } from "node:path";

import * as v from "valibot";

import {
  RequestLedger,
  type RequestIdentity,
} from "./provider-accounting/request-ledger.ts";
import { diagnostics } from "./runtime-diagnostics.ts";

import type {
  Api,
  AssistantMessageEventStream,
  Provider,
  StreamOptions,
} from "@earendil-works/pi-ai";
import type {
  FlueExecutionContext,
  FlueExecutionInterceptor,
} from "@flue/runtime";

const configSchema = v.strictObject({
  ledgerPath: v.pipe(v.string(), v.check(isAbsolute)),
  runId: v.pipe(v.string(), v.minLength(1)),
});

/** Explicit evidence configuration only. No configuration means no filesystem access. */
export const createStepARequestAccounting = (
  configuration: string | undefined,
  resolveIdentity?: () => RequestIdentity,
) => {
  if (configuration === undefined) return undefined;
  // Do not print an invalid configuration: it is an untrusted environment boundary.
  let config: v.InferOutput<typeof configSchema>;
  try {
    config = v.parse(configSchema, JSON.parse(configuration));
  } catch {
    throw new Error("Invalid Step A accounting configuration.");
  }
  const ledger = new RequestLedger(
    config.ledgerPath,
    join(dirname(config.ledgerPath), "attempt-ledger.md"),
    config.runId,
  );
  const scope = new AsyncLocalStorage<{
    context: FlueExecutionContext;
    modelOperation: boolean;
  }>();
  const interceptor: FlueExecutionInterceptor = (operation, context, next) =>
    scope.run(
      {
        context: {
          ...scope.getStore()?.context,
          ...context,
          ...(operation.type === "model" ? { turnId: operation.turnId } : {}),
        },
        modelOperation: operation.type === "model",
      },
      next,
    );

  const wrap = (
    provider: Provider,
    isActive: () => boolean,
    beforeRequest?: (
      model: Parameters<Provider["streamSimple"]>[0],
      options: StreamOptions | undefined,
    ) => void,
  ): Provider => {
    const start = (
      model: Parameters<Provider["streamSimple"]>[0],
      options: StreamOptions | undefined,
      invoke: (options: StreamOptions) => AssistantMessageEventStream,
    ) => {
      beforeRequest?.(model, options);
      const execution = scope.getStore();
      const attempt = ledger.prepare(
        resolveIdentity
          ? resolveIdentity()
          : execution?.modelOperation
            ? execution.context
            : undefined,
        model,
      );
      if (options?.signal?.aborted) {
        attempt.notStarted();
        throw new Error(
          "Step A accounting: cancelled before native invocation.",
        );
      }
      // This durable unknown marker precedes even synchronous provider execution.
      // A synchronous throw is NOT evidence that no transport started.
      attempt.started();
      let stream: AssistantMessageEventStream;
      const dispatch = { started: false };
      try {
        stream = invoke({
          ...options,
          maxTokens: Math.min(
            options?.maxTokens ?? attempt.maxOutputTokens,
            attempt.maxOutputTokens,
          ),
          maxRetries: 0,
          onPayload: async (payload, selectedModel) => {
            const replacement = await options?.onPayload?.(
              payload,
              selectedModel,
            );
            const bounded = replacement ?? payload;
            const parsed = v.safeParse(
              v.looseObject({
                model: v.literal(model.id),
                max_tokens: v.pipe(
                  v.number(),
                  v.integer(),
                  v.minValue(1),
                  v.maxValue(attempt.maxOutputTokens),
                ),
              }),
              bounded,
            );
            if (!parsed.success)
              throw new Error(
                "Step A accounting: serialized request exceeds reserved model/token bounds.",
              );
            return replacement;
          },
          fetch: (input, init) => {
            beforeRequest?.(model, options);
            if (options?.signal?.aborted)
              throw new Error(
                "Step A accounting: cancelled before SDK dispatch.",
              );
            // Installed Anthropic transport uses this supported SDK seam. A
            // second dispatch is a forbidden silent retry, not a free request.
            attempt.dispatched();
            dispatch.started = true;
            return (options?.fetch ?? globalThis.fetch)(input, init);
          },
        });
      } catch (error) {
        // The wrapper below hides the native cause from the caller by design;
        // the diagnostic sink is where that cause remains visible.
        diagnostics.report("provider-accounting", error, {
          event: "native-invocation",
          dispatched: dispatch.started,
          turnId: execution?.context.turnId,
          submissionId: execution?.context.submissionId,
        });
        if (dispatch.started) attempt.unknown();
        else attempt.notStarted();
        throw new Error(
          "Step A accounting: native invocation failed; no automatic retry.",
        );
      }
      const onAbort = () => {
        try {
          attempt.unknown();
        } catch (error) {
          diagnostics.report("provider-accounting", error, {
            event: "ledger-poisoned",
            reason: "abort",
            turnId: execution?.context.turnId,
            submissionId: execution?.context.submissionId,
          });
          ledger.poison();
        }
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      if (options?.signal?.aborted) onAbort();
      // Exactly one eager terminal observer beneath admission. Never await this on
      // Stop, and never use its result to publish content or resume a conversation.
      void stream
        .result()
        .then(
          (message) => attempt.terminal(message),
          (error: unknown) => {
            diagnostics.report("provider-accounting", error, {
              event: "stream-failed",
              dispatched: dispatch.started,
              turnId: execution?.context.turnId,
              submissionId: execution?.context.submissionId,
            });
            return dispatch.started ? attempt.unknown() : attempt.notStarted();
          },
        )
        .catch((error: unknown) => {
          diagnostics.report("provider-accounting", error, {
            event: "ledger-poisoned",
            reason: "terminal-record",
            turnId: execution?.context.turnId,
            submissionId: execution?.context.submissionId,
          });
          ledger.poison();
        })
        .finally(() => options?.signal?.removeEventListener("abort", onAbort));
      const iterator = stream[Symbol.asyncIterator].bind(stream);
      stream[Symbol.asyncIterator] = async function* observeProgress() {
        for await (const event of { [Symbol.asyncIterator]: iterator }) {
          if ("partial" in event) attempt.partial(event.partial);
          yield event;
        }
      };
      return stream;
    };
    return {
      ...provider,
      stream(model, context, options) {
        return isActive()
          ? start(model, options, (bounded) =>
              provider.stream<Api>(model, context, bounded),
            )
          : provider.stream(model, context, options);
      },
      streamSimple(model, context, options) {
        return isActive()
          ? start(model, options, (bounded) =>
              provider.streamSimple(model, context, bounded),
            )
          : provider.streamSimple(model, context, options);
      },
    };
  };
  return { interceptor, wrap };
};
