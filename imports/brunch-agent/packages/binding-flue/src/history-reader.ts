import type { CaptureStore, JsonValue, SessionEntryKind } from '@brunch/core';
import type { SessionLogRead } from '@brunch/core/storage';
import {
  createFlueClient,
  type FlueConversationMessage,
  type FlueConversationSnapshot,
} from '@flue/sdk';
import { archiveThroughBinding } from './archive-capability.ts';

export interface FlueHistoryReaderOptions {
  /** Host-owned full conversation URL; the binding never guesses the mount. */
  readonly resolveConversationUrl: (sessionId: string) => string;
  /** Host-owned transport, including in-process router.fetch adapters. */
  readonly transport: typeof fetch;
  readonly archive: CaptureStore;
}

export interface FlueHistoryReader {
  read(sessionId: string): Promise<FlueConversationSnapshot>;
}

const materializedJson = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

const messageText = (message: FlueConversationMessage): string =>
  message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');

const affordanceIdFrom = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined;
  return typeof value.id === 'string' && value.id.length > 0 ? value.id : undefined;
};

const classifyMessages = (
  messages: readonly FlueConversationMessage[],
): readonly SessionLogRead['entries'][number][] => {
  const emittedAffordanceIds = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      const id =
        part.type === 'data-affordance'
          ? affordanceIdFrom(part.data)
          : part.type === 'dynamic-tool' && part.state === 'output-available'
            ? affordanceIdFrom(part.output)
            : undefined;
      if (id) emittedAffordanceIds.add(id);
    }
  }
  const affordanceReplyIds = new Set<string>();
  for (let index = 1; index < messages.length; index += 1) {
    const message = messages[index]!;
    const previous = messages[index - 1]!;
    const affordanceId = message.signal?.attributes?.affordanceId;
    if (
      message.role === 'system' &&
      message.purpose === 'dispatch' &&
      message.signal?.tagName === 'affordance-reply-bound' &&
      typeof affordanceId === 'string' &&
      emittedAffordanceIds.has(affordanceId) &&
      previous.role === 'user' &&
      previous.purpose === 'user'
    ) {
      affordanceReplyIds.add(previous.id);
    }
  }

  return messages.map((message) => {
    let kind: SessionEntryKind;
    if (message.role === 'user' && message.purpose === 'user') {
      kind = affordanceReplyIds.has(message.id) ? 'user-affordance-payload' : 'user';
    } else if (message.role === 'assistant' && message.purpose === 'assistant') {
      kind = 'assistant';
    } else {
      kind = 'non-user';
    }
    return {
      substrateEntryId: message.id,
      kind,
      text: messageText(message),
      materialized: materializedJson(message),
    };
  });
};

export const createFlueHistoryReader = (options: FlueHistoryReaderOptions): FlueHistoryReader => ({
  async read(sessionId) {
    const client = createFlueClient({
      url: options.resolveConversationUrl(sessionId),
      fetch: options.transport,
    });
    const snapshot = await client.history();
    await archiveThroughBinding(options.archive, {
      sessionId,
      substrateConversationId: snapshot.conversationId,
      offset: snapshot.offset,
      ...(snapshot.incarnation === undefined ? {} : { incarnation: snapshot.incarnation }),
      entries: classifyMessages(snapshot.messages),
      settlements: snapshot.settlements.map(materializedJson),
    });
    return snapshot;
  },
});
