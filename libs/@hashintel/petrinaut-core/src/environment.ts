/**
 * Runtime-environment shapes used by the headless core APIs.
 *
 * These are intentionally structural rather than aliases to browser globals
 * like `Worker`, `MessageEvent`, or `AbortSignal`. Browser, Node, and test
 * implementations can satisfy the same contract without forcing consumers of
 * `@hashintel/petrinaut-core` to include DOM types.
 */

export type WorkerMessageEnvelope<TMessage = unknown> = {
  readonly data: TMessage;
};

export type WorkerMessageHandler<TMessage = unknown> = (
  event: WorkerMessageEnvelope<TMessage>,
) => void;

export interface WorkerLike<
  TOutboundMessage = unknown,
  TInboundMessage = unknown,
> {
  postMessage(message: TOutboundMessage): void;
  addEventListener(
    type: "message",
    listener: WorkerMessageHandler<TInboundMessage>,
  ): void;
  removeEventListener?(
    type: "message",
    listener: WorkerMessageHandler<TInboundMessage>,
  ): void;
  terminate(): void;
}

export type WorkerFactoryLike<
  TOutboundMessage = unknown,
  TInboundMessage = unknown,
> = () =>
  | WorkerLike<TOutboundMessage, TInboundMessage>
  | Promise<WorkerLike<TOutboundMessage, TInboundMessage>>;

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

type WorkerScriptGlobal<
  TInboundMessage = unknown,
  TOutboundMessage = unknown,
> = {
  postMessage(message: TOutboundMessage): void;
  addEventListener(
    type: "message",
    listener: WorkerMessageHandler<TInboundMessage>,
  ): void;
};

// Worker entrypoints still run inside real worker globals, but core's public
// TypeScript config intentionally does not depend on DOM or Node ambient libs.
// Keep those runtime-only globals private to this file so worker modules use
// the abstract WorkerThreadRuntime facade instead of redeclaring them locally.
declare const self: WorkerScriptGlobal;
declare const setTimeout: (handler: () => void, timeout?: number) => unknown;

export interface WorkerThreadRuntime<TInboundMessage, TOutboundMessage> {
  postMessage(message: TOutboundMessage): void;
  onMessage(listener: (message: TInboundMessage) => void): void;
  delay(timeout?: number): Promise<void>;
}

export function createWorkerThreadRuntime<
  TInboundMessage,
  TOutboundMessage,
>(): WorkerThreadRuntime<TInboundMessage, TOutboundMessage> {
  const scope = self as WorkerScriptGlobal<TInboundMessage, TOutboundMessage>;

  return {
    postMessage(message) {
      scope.postMessage(message);
    },
    onMessage(listener) {
      scope.addEventListener("message", ({ data }) => listener(data));
    },
    delay(timeout) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(undefined), timeout);
      });
    },
  };
}
