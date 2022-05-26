import { v4 as uuid } from "uuid";
import { EmbedderServiceHandler } from "./embedder-service";

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

type MessageData<T = any> = {
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

export type ElementToListenOn = HTMLElement | HTMLIFrameElement;

export class EmbedderCoreHandler {
  private element: ElementToListenOn;
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

  private readonly services: Map<string, EmbedderServiceHandler>;
  readonly serviceName: "core" = "core";

  private static readonly customEventName = "blockprotocolmessage";
  private static readonly instanceMap = new Map<
    ElementToListenOn,
    EmbedderCoreHandler
  >();

  static registerService({
    element,
    service,
  }: {
    element: ElementToListenOn;
    service: EmbedderServiceHandler;
  }) {
    const { serviceName } = service;
    const handler =
      this.instanceMap.get(element) ?? new EmbedderCoreHandler({ element });
    handler.services.set(serviceName, service);
    handler.messageCallbacksByService[serviceName] ??= {};
    return handler;
  }

  static unregisterService(element: ElementToListenOn) {
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
    element: ElementToListenOn;
  }) {
    this.defaultMessageCallback = defaultMessageCallback;
    this.settlersForMessagesAwaitingResponse = new Map();
    this.messageCallbacksByService = callbacks ?? {};

    this.services = new Map();

    this.element = element;
    this.attachEventListeners();

    EmbedderCoreHandler.instanceMap.set(element, this);
  }

  private isSelfContainedBlock(this: EmbedderCoreHandler) {
    return this.element instanceof HTMLIFrameElement;
  }

  private attachEventListeners(this: EmbedderCoreHandler) {
    if (!this.element) {
      throw new Error(
        "Cannot attach event listeners before element set on EmbedderCoreHandler instance.",
      );
    }
    if (this.element instanceof HTMLIFrameElement) {
      if (!this.element.contentWindow) {
        throw new Error("No contentWindow present on iFrame.");
      }
      this.element.contentWindow.addEventListener("message", (event) => {
        void this.processReceivedMessage(event);
      });
    } else {
      this.element.addEventListener(
        EmbedderCoreHandler.customEventName,
        (event) => {
          void this.processReceivedMessage(event as CustomEvent);
        },
      );
    }
  }

  private removeEventListeners(this: EmbedderCoreHandler) {
    if (this.element instanceof HTMLIFrameElement) {
      this.element.contentWindow?.removeEventListener("message", (event) => {
        void this.processReceivedMessage(event);
      });
    } else {
      this.element?.removeEventListener(
        EmbedderCoreHandler.customEventName,
        (event) => {
          void this.processReceivedMessage(event as CustomEvent);
        },
      );
    }
  }

  private updateElement(this: EmbedderCoreHandler, element: ElementToListenOn) {
    this.removeEventListeners();
    this.element = element;
    this.attachEventListeners();
  }

  private updateElementFromEvent(
    this: EmbedderCoreHandler,
    event: CustomEvent,
  ) {
    if (!event.target) {
      throw new Error("Could not update element from event – no event.target.");
    }
    if (!(event.target instanceof HTMLElement)) {
      throw new Error(
        "'blockprotocolmessage' event must be sent from an HTMLElement.",
      );
    }
    this.updateElement(event.target);
  }

  private processInitMessage(
    this: EmbedderCoreHandler,
    {
      event,
      message,
    }: {
      event: CustomEvent | MessageEvent;
      message: BlockProtocolMessage;
    },
  ) {
    // If we're dealing with a component block, update the element to send events on
    // to the element the block dispatched the init message from
    if (!this.isSelfContainedBlock() && event instanceof CustomEvent) {
      this.updateElementFromEvent(event);
    }

    // get the properties sent on initialization for any registered services
    const payload: Record<string, Record<string, any>> = {};
    for (const [serviceName, serviceInstance] of this.services) {
      payload[serviceName] = serviceInstance.getInitPayload();
    }

    const response: BlockProtocolMessageContents = {
      name: "initResponse",
      payload,
    };
    void this.sendMessage({
      partialMessage: response,
      requestId: message.requestId,
      sender: this,
    });
  }

  registerCallback(
    this: EmbedderCoreHandler,
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
    this: EmbedderCoreHandler,
    {
      partialMessage,
      requestId,
      respondedToBy,
      sender,
    }: {
      partialMessage: BlockProtocolMessageContents;
      requestId?: string;
      respondedToBy?: string;
      sender: EmbedderCoreHandler | EmbedderServiceHandler;
    },
  ) {
    if (!sender.serviceName) {
      throw new Error("Message sender has no serviceName set.");
    }
    const fullMessage: BlockProtocolMessage = {
      ...partialMessage,
      requestId: requestId ?? uuid(),
      service: sender.serviceName,
      source: "embedder",
    };
    if (this.element instanceof HTMLIFrameElement) {
      this.element.contentWindow!.postMessage(
        {
          detail: fullMessage,
          type: EmbedderCoreHandler.customEventName,
        },
        "*",
      );
    } else {
      const event = new CustomEvent(EmbedderCoreHandler.customEventName, {
        bubbles: true,
        composed: true,
        detail: fullMessage,
      });
      this.element.dispatchEvent(event);
    }
    if (respondedToBy) {
      let resolveToStore: PromiseConstructorFnArgs[0] | undefined = undefined;
      let rejectToStore: PromiseConstructorFnArgs[1] | undefined = undefined;
      const promise = new Promise((resolve, reject) => {
        resolveToStore = resolve;
        rejectToStore = reject;
      });
      this.settlersForMessagesAwaitingResponse.set(fullMessage.requestId, {
        expectedResponseName: respondedToBy,
        resolve: resolveToStore!,
        reject: rejectToStore!,
      });
      return promise;
    }
    return fullMessage;
  }

  private async processReceivedMessage(
    this: EmbedderCoreHandler,
    messageEvent: MessageEvent | CustomEvent,
  ) {
    console.log({ messageEvent });
    if (this.isSelfContainedBlock()) {
      // we are expecting self-contained blocks to be sending messages via postMessage,
      // and for the 'data' on these messages to contain 'type' of our custom event name, and 'detail'
      if (
        messageEvent.type !== "message" ||
        !("data" in messageEvent) ||
        !("detail" in messageEvent.data) ||
        messageEvent.data.type !== EmbedderCoreHandler.customEventName
      ) {
        return;
      }
    } else if (messageEvent.type !== EmbedderCoreHandler.customEventName) {
      // for component-type blocks, we expect messages to be transported in our CustomEvent
      return;
    }

    const message =
      "detail" in messageEvent ? messageEvent.detail : messageEvent.data.detail;

    console.log({ message });

    // if this isn't a BP message, or it's one the embedder sent, ignore it
    if (!EmbedderCoreHandler.isBlockProtocolMessage(message)) {
      return;
    } else if (message.source === "embedder") {
      return;
    }

    const { errors, name, payload, requestId, respondedToBy, service } =
      message;

    if (service === "core" && name === "init") {
      this.processInitMessage({ event: messageEvent, message });
      return;
    }

    const callback =
      this.messageCallbacksByService[service]?.[name] ??
      this.defaultMessageCallback;

    if (respondedToBy && !callback) {
      throw new Error(
        `Message '${name}' expected a response, but no callback for '${name}' provided.`,
      );
    }

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
