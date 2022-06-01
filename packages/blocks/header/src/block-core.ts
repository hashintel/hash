import { v4 as uuid } from "uuid";
import { BlockServiceHandler } from "./block-service";

export interface BlockProtocolMessageContents {
  name: string;
  payload?: any;
  errors?: {
    code: string;
    message: string;
    extensions?: any;
  }[];
}

export interface BlockProtocolMessage extends BlockProtocolMessageContents {
  requestId: string;
  // the name of the message expected to respond to this message, if any
  respondedToBy?: string;
  // the name of the service this message is sent under
  service: string;
  // the source of the message
  source: "block" | "embedder";
}

type PromiseConstructorFnArgs = Parameters<
  ConstructorParameters<PromiseConstructorLike>[0]
>;

type PromiseResolver = PromiseConstructorFnArgs[0];
type PromiseRejecter = PromiseConstructorFnArgs[1];

export type MessageData<T = any> = {
  payload?: T;
  errors?: BlockProtocolMessage["errors"];
};

export type MessageCallback<Input, Return> = {
  (messageData: MessageData<Input>):
    | MessageData<Return>
    | Promise<MessageData<Return>>
    | void;
};

type MessageCallbacksByService = {
  [serviceName: string]: { [messageName: string]: MessageCallback<any, any> };
};

export type SendMessageArgs = {
  partialMessage: BlockProtocolMessageContents;
  requestId?: string;
  sender: BlockCoreHandler | BlockServiceHandler;
};

export class BlockCoreHandler {
  private readonly element?: HTMLElement;
  private readonly messageCallbacksByService: MessageCallbacksByService;
  private readonly defaultMessageCallback?: MessageCallback<any, any>;
  private readonly settlersForMessagesAwaitingResponse: Map<
    string,
    {
      expectedResponseName: string;
      resolve: PromiseResolver;
      reject: PromiseRejecter;
    }
  >;

  private readonly services: Map<string, BlockServiceHandler>;
  readonly serviceName: "core" = "core";

  private static readonly customEventName = "blockprotocolmessage";
  private static readonly coreHandlerMap = new Map<
    HTMLElement | null,
    BlockCoreHandler
  >();

  static registerService({
    element,
    service,
  }: {
    element: HTMLElement | null;
    service: BlockServiceHandler;
  }) {
    const { serviceName } = service;
    const handler =
      this.coreHandlerMap.get(element) ?? new BlockCoreHandler({ element });
    handler.services.set(serviceName, service);
    handler.messageCallbacksByService[serviceName] ??= {};
    return handler;
  }

  static unregisterService(element: HTMLElement | null) {
    // @todo
  }

  private static isBlockProtocolMessage(
    message: unknown,
  ): message is BlockProtocolMessage {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      return false;
    }
    if (
      !("requestId" in message) ||
      !("service" in message) ||
      !("source" in message) ||
      !("name" in message)
    ) {
      return false;
    }
    return true;
  }

  private constructor({
    callbacks,
    defaultMessageCallback,
    element,
  }: {
    callbacks?: MessageCallbacksByService;
    defaultMessageCallback?: MessageCallback<any, any>;
    element: HTMLElement | null;
  }) {
    this.defaultMessageCallback = defaultMessageCallback;
    this.settlersForMessagesAwaitingResponse = new Map();
    this.messageCallbacksByService = callbacks ?? {};
    this.services = new Map();

    if (element) {
      this.element = element;
      element.addEventListener(BlockCoreHandler.customEventName, (event) => {
        void this.processReceivedMessage(event as CustomEvent);
      });
    } else if (window.top === window.self || !window.opener) {
      throw new Error(
        "You must provide an element to initialize a block if the block is not sandboxed. Either provide an element, or load the block in a sandbox.",
      );
    } else {
      window.opener.addEventListener("message", this.processReceivedMessage);
    }

    BlockCoreHandler.coreHandlerMap.set(element, this);

    this.initialize();
  }

  private initialize() {
    void this.sendMessage({
      partialMessage: { name: "init" },
      respondedToBy: "initResponse",
      sender: this,
    });
  }

  registerCallback(
    this: BlockCoreHandler,
    {
      callback,
      messageName,
      serviceName,
    }: {
      callback: MessageCallback<any, any>;
      messageName: string;
      serviceName: string;
    },
  ) {
    this.messageCallbacksByService[serviceName] ??= {};
    this.messageCallbacksByService[serviceName]![messageName] = callback;
  }

  sendMessage(
    this: BlockCoreHandler,
    args: SendMessageArgs,
  ): BlockProtocolMessage;

  sendMessage<ExpectedResponseData>(
    this: BlockCoreHandler,
    args: SendMessageArgs & { respondedToBy: string },
  ): Promise<MessageData<ExpectedResponseData>>;

  sendMessage<ExpectedResponseData>(
    this: BlockCoreHandler,
    args: SendMessageArgs | (SendMessageArgs & { respondedToBy: string }),
  ): BlockProtocolMessage | Promise<MessageData<ExpectedResponseData>> {
    const { partialMessage, requestId, sender } = args;
    if (!sender.serviceName) {
      throw new Error("Message sender has no serviceName set.");
    }
    const fullMessage: BlockProtocolMessage = {
      ...partialMessage,
      requestId: requestId ?? uuid(),
      respondedToBy: "respondedToBy" in args ? args.respondedToBy : undefined,
      service: sender.serviceName,
      source: "block",
    };
    if (this.element) {
      const event = new CustomEvent(BlockCoreHandler.customEventName, {
        bubbles: true,
        composed: true,
        detail: fullMessage,
      });
      this.element.dispatchEvent(event);
    } else {
      window.opener.postMessage(
        {
          detail: fullMessage,
          type: BlockCoreHandler.customEventName,
        },
        "*",
      );
    }
    if ("respondedToBy" in args && args.respondedToBy) {
      let resolveToStore: PromiseConstructorFnArgs[0] | undefined = undefined;
      let rejectToStore: PromiseConstructorFnArgs[1] | undefined = undefined;
      const promise = new Promise<MessageData<ExpectedResponseData>>(
        (resolve, reject) => {
          resolveToStore = resolve as any; // @todo fix these casts
          rejectToStore = reject as any;
        },
      );
      this.settlersForMessagesAwaitingResponse.set(fullMessage.requestId, {
        expectedResponseName: args.respondedToBy,
        resolve: resolveToStore!,
        reject: rejectToStore!,
      });
      return promise;
    }
    return fullMessage;
  }

  private async processReceivedMessage(
    this: BlockCoreHandler,
    messageEvent: MessageEvent | CustomEvent,
  ) {
    console.log(messageEvent);
    if (
      // we are expecting consumers attached to elements to send messages via our custom event
      this.element &&
      messageEvent.type !== BlockCoreHandler.customEventName
    ) {
      return;
    } else if (!this.element) {
      if (
        // we are expecting consumers without elements to be sending messages via postMessage,
        // and for the 'data' on these messages to contain 'type' of our custom event name, and 'detail'
        messageEvent.type !== "message" ||
        !("data" in messageEvent) ||
        !("detail" in messageEvent.data) ||
        messageEvent.data.type !== BlockCoreHandler.customEventName
      ) {
        return;
      }
    }
    const message =
      "detail" in messageEvent ? messageEvent.detail : messageEvent.data.detail;

    // if this isn't a BP message, or it's one the block sent, ignore it
    if (!BlockCoreHandler.isBlockProtocolMessage(message)) {
      return;
    } else if (message.source === "block") {
      return;
    }

    const { errors, name, payload, requestId, respondedToBy, service } =
      message;

    const callback =
      this.messageCallbacksByService[service]?.[name] ??
      this.defaultMessageCallback;

    if (callback) {
      if (respondedToBy) {
        const serviceHandler = this.services.get(service);
        if (!serviceHandler) {
          throw new Error(`Handler for service ${service} not registered.`);
        }
        const { payload: responsePayload, errors: responseErrors } =
          (await callback({ payload, errors })) ?? {};

        void this.sendMessage({
          partialMessage: {
            name: respondedToBy,
            payload: responsePayload,
            errors: responseErrors,
          },
          requestId,
          sender: serviceHandler,
        });
      } else {
        void callback({ payload, errors });
      }
    }

    // Check if this message is responding to another, and settle the outstanding promise
    const messageAwaitingResponse =
      this.settlersForMessagesAwaitingResponse.get(requestId);
    if (messageAwaitingResponse) {
      if (messageAwaitingResponse.expectedResponseName !== name) {
        throw new Error(
          `Message with requestId '${requestId}' expected response from message named '${messageAwaitingResponse.expectedResponseName}', received response from '${name}' instead.`,
        );
      }
      messageAwaitingResponse.resolve({ payload, errors });
    }
  }
}
