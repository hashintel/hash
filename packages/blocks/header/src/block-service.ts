import {
  BlockCoreHandler,
  BlockProtocolMessage,
  BlockProtocolMessageContents,
  MessageCallback,
  MessageData,
  SendMessageArgs,
} from "./block-core";

export abstract class BlockServiceHandler {
  private readonly coreHandler: BlockCoreHandler;
  private readonly element: HTMLElement | null;
  readonly serviceName: string;

  protected constructor({
    element,
    serviceName,
  }: {
    element?: HTMLElement | null;
    serviceName: string;
  }) {
    this.element = element ?? null;
    this.serviceName = serviceName;
    this.coreHandler = BlockCoreHandler.registerService({
      element: element ?? null,
      service: this,
    });
  }

  protected registerCallbacks(
    this: BlockServiceHandler,
    callbacks: Record<string, MessageCallback<any, any>>,
  ) {
    for (const [messageName, callback] of Object.entries(callbacks)) {
      this.registerCallback({ messageName, callback });
    }
  }

  protected registerCallback(
    this: BlockServiceHandler,
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
    this: BlockServiceHandler,
    args: { message: BlockProtocolMessageContents },
  ): BlockProtocolMessage;

  protected sendMessage<ExpectedResponseData>(
    this: BlockServiceHandler,
    args: { message: BlockProtocolMessageContents; respondedToBy: string },
  ): Promise<MessageData<ExpectedResponseData>>;

  protected sendMessage<ExpectedResponseData>(
    this: BlockServiceHandler,
    args: {
      message: BlockProtocolMessageContents;
      respondedToBy?: string;
    },
  ): BlockProtocolMessage | Promise<MessageData<ExpectedResponseData>> {
    if ("respondedToBy" in args && args.respondedToBy) {
      return this.coreHandler.sendMessage<ExpectedResponseData>({
        partialMessage: args.message,
        respondedToBy: args.respondedToBy,
        sender: this,
      });
    }
    return this.coreHandler.sendMessage({
      partialMessage: args.message,
      sender: this,
    });
  }
}
