import {
  type Conversation,
  type Harness,
  type InboxState,
  type LiveState,
} from "@earendil-works/pi-durable";

import { BrowserCallsDoc } from "../../../src/browser-call/browser-call";

import type { Context } from "@earendil-works/chord";
import type { ToolCall } from "@earendil-works/pi-ai";

/**
 * What a panel joining now would render, read only from committed state: the
 * conversation's `viewState()` (transcript, `pi.live`, `pi.inbox`) and the
 * browser-call document it claims from. `pi.system` entries mark prompt
 * changes and are left out.
 */
export const panelView = async (
  harness: Harness,
  conversation: Conversation,
  context: Context,
) => {
  const state = await conversation.viewState(context);
  const { entries, docs } = state.value;
  state.dispose();
  const live = docs["pi.live"] as LiveState | undefined;
  const inbox = docs["pi.inbox"] as InboxState | undefined;
  const calls =
    (await harness.snapshot(BrowserCallsDoc, conversation.id, context))
      ?.calls ?? {};
  const toolCalls = entries.flatMap(({ model }) =>
    (model ?? []).flatMap((message) =>
      message.role === "assistant"
        ? message.content.filter(
            (part): part is ToolCall => part.type === "toolCall",
          )
        : [],
    ),
  );
  return {
    transcript: entries
      .filter(({ kind }) => kind !== "pi.system")
      .map(({ id, kind }) => ({ id, kind })),
    run: live?.run ?? null,
    generation: live?.generation ?? null,
    tools: (live?.tools ?? []).map((slot) => {
      const record = Object.hasOwn(calls, slot.callId)
        ? calls[slot.callId]
        : undefined;
      return {
        callId: slot.callId,
        name: slot.name,
        slot: slot.status,
        toolTask: slot.taskId ?? null,
        arguments:
          toolCalls.find((call) => call.id === slot.callId)?.arguments ?? null,
        browserCall:
          record === undefined
            ? null
            : {
                status: record.status,
                task: record.task,
                doorbell: record.doorbell,
                expiresAt: record.expiresAt,
              },
      };
    }),
    inbox: inbox?.items ?? [],
  };
};

export type PanelView = Awaited<ReturnType<typeof panelView>>;
