import { createContext, type RefObject, use } from "react";

import type { OpenAIVoiceConfig } from "../../voice-interview/voice-interview-control";
import type { ActiveHandle } from "../active-handle";
import type {
  DocumentRecord,
  DocumentRepository,
  ProcessAgentSeed,
} from "../documents/document-repository";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export type StockMessagesByNetId = Record<string, PetrinautAiMessage[]>;

/**
 * What the demo host owns and its assistant plugins read: the open document
 * and its live handle, the repository's durability barrier, the stock
 * assistant's per-net history, and the Voice preference and availability.
 * The plugins are module constants; only this value changes.
 */
export type DemoAssistantHost = {
  activeHandle: ActiveHandle;
  /** The same handle, for callbacks that must read it after render. */
  activeHandleRef: RefObject<ActiveHandle | null>;
  document: DocumentRecord;
  processAgentSeed: ProcessAgentSeed | undefined;
  settleRevision: DocumentRepository["settleRevision"];
  stockMessages: {
    byNetId: StockMessagesByNetId;
    setByNetId: (
      update: (previous: StockMessagesByNetId) => StockMessagesByNetId,
    ) => void;
  };
  voice: {
    enabled: boolean;
    ready: boolean;
    setEnabled: (enabled: boolean) => void;
    /** `undefined` while unknown, `null` where this deployment has none. */
    config: OpenAIVoiceConfig | null | undefined;
    setConfig: (config: OpenAIVoiceConfig | null | undefined) => void;
  };
};

export const DemoAssistantHostContext = createContext<DemoAssistantHost | null>(
  null,
);

export const useDemoAssistantHost = (): DemoAssistantHost => {
  const host = use(DemoAssistantHostContext);
  if (host === null) {
    throw new Error(
      "A demo assistant plugin must render inside DemoAssistantHostContext.",
    );
  }
  return host;
};
