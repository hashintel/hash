import {
  EmbedderCoreHandler,
  BlockProtocolMessageContents,
  ElementToListenOn,
  MessageCallback,
} from "./embedder-core";

export abstract class EmbedderServiceHandler {
  private readonly coreHandler: EmbedderCoreHandler;
  private readonly element: ElementToListenOn;
  readonly serviceName: string;

  abstract getInitPayload(): Record<string, Record<string, any>>;

  protected constructor({
    element,
    serviceName,
  }: {
    element: ElementToListenOn;
    serviceName: string;
  }) {
    this.element = element ?? null;
    this.serviceName = serviceName;
    this.coreHandler = EmbedderCoreHandler.registerService({
      element,
      service: this,
    });
  }

  protected registerCallbacks(
    this: EmbedderServiceHandler,
    callbacks: Record<string, MessageCallback<any, any>>,
  ) {
    for (const [messageName, callback] of Object.entries(callbacks)) {
      this.registerCallback({ messageName, callback });
    }
  }

  protected registerCallback(
    this: EmbedderServiceHandler,
    {
      messageName,
      callback,
    }: {
      messageName: string;
      callback: MessageCallback<any, any>;
    },
  ) {
    this.coreHandler.registerCallback({
      callback,
      messageName,
      serviceName: this.serviceName,
    });
  }

  protected sendMessage(
    this: EmbedderServiceHandler,
    {
      message,
      respondedToBy,
    }: {
      message: BlockProtocolMessageContents;
      respondedToBy?: string;
    },
  ) {
    return this.coreHandler.sendMessage({
      partialMessage: message,
      respondedToBy,
      sender: this,
    });
  }
}
