/**
 * Runtime-environment shapes used by the headless core APIs.
 *
 * These are intentionally structural rather than aliases to browser globals
 * like `Worker`, `MessageEvent`, or `AbortSignal`. Browser, Node, and test
 * implementations can satisfy the same contract without forcing consumers of
 * `@hashintel/petrinaut-core` to include DOM types.
 */

export type MessageEventLike<TMessage = unknown> = {
  readonly data: TMessage;
};

export type MessageListener<TMessage = unknown> = (
  event: MessageEventLike<TMessage>,
) => void;

export interface WorkerLike<
  TOutboundMessage = unknown,
  TInboundMessage = unknown,
> {
  postMessage(message: TOutboundMessage): void;
  addEventListener(
    type: "message",
    listener: MessageListener<TInboundMessage>,
  ): void;
  removeEventListener?(
    type: "message",
    listener: MessageListener<TInboundMessage>,
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

export interface WorkerGlobalScopeLike<
  TInboundMessage = unknown,
  TOutboundMessage = unknown,
> {
  postMessage(message: TOutboundMessage): void;
  onmessage: MessageListener<TInboundMessage> | null;
}
