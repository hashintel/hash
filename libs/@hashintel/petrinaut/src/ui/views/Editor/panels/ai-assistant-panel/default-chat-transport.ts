import { DefaultChatTransport as AiDefaultChatTransport } from "ai";

import type { UIMessage } from "ai";

/** @deprecated Import `DefaultChatTransport` from `ai`. */
export const DefaultChatTransport: typeof AiDefaultChatTransport =
  AiDefaultChatTransport;

/** @deprecated Import `DefaultChatTransport` from `ai`. */
export type DefaultChatTransport<UI_MESSAGE extends UIMessage> =
  AiDefaultChatTransport<UI_MESSAGE>;
