import { hashCanonicalSpeechText } from "../../../canonical-speech-fingerprint";

import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export { hashCanonicalSpeechText };

export interface CanonicalSpeechSegment {
  readonly contentHash: string;
  readonly id: string;
  readonly messageId: string;
  readonly partId: string;
  readonly source: "assistant-question" | "assistant-text";
  /**
   * Every Flue submission that wrote to this segment's message: the one that
   * started it plus any client-tool continuation projected back onto it.
   */
  readonly submissionIds?: readonly AgentSendResult["submissionId"][];
  readonly text: string;
}

const createSegment = (
  messageId: string,
  partId: string,
  source: CanonicalSpeechSegment["source"],
  text: string,
): CanonicalSpeechSegment => {
  const contentHash = hashCanonicalSpeechText(text);
  return {
    contentHash,
    id: [
      "canonical-speech",
      encodeURIComponent(messageId),
      encodeURIComponent(partId),
      contentHash,
    ].join(":"),
    messageId,
    partId,
    source,
    text,
  };
};

const finalizedTurnText = (message: PetrinautAiMessage): string | undefined => {
  const speechAndToolParts = message.parts.filter(
    (part) => part.type === "text" || "toolCallId" in part,
  );
  const terminalPart = speechAndToolParts.at(-1);
  if (terminalPart?.type !== "text" || terminalPart.state === "streaming") {
    return undefined;
  }

  const finalizedTexts = message.parts.flatMap((part) =>
    part.type === "text" && part.state !== "streaming" && part.text.trim()
      ? [part.text]
      : [],
  );
  return finalizedTexts.length > 0 ? finalizedTexts.join("\n\n") : undefined;
};

export interface CanonicalSpeechSelection {
  readonly questionSegment?: CanonicalSpeechSegment;
  readonly segments: CanonicalSpeechSegment[];
}

export const selectCanonicalSpeech = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSelection => {
  const segments: CanonicalSpeechSegment[] = [];
  let questionSegment: CanonicalSpeechSegment | undefined;

  for (const message of messages) {
    if (message.role !== "assistant" || message.metadata?.stopped) {
      continue;
    }

    for (const [partIndex, part] of message.parts.entries()) {
      if (
        part.type === "text" &&
        part.state !== "streaming" &&
        part.text.trim()
      ) {
        segments.push(
          createSegment(
            message.id,
            `text:${partIndex}`,
            "assistant-text",
            part.text,
          ),
        );
      }
    }

    const turnText = finalizedTurnText(message);
    if (turnText !== undefined) {
      questionSegment = createSegment(
        message.id,
        "question:finalized-turn",
        "assistant-question",
        turnText,
      );
    }
  }

  return { questionSegment, segments };
};

export const selectCanonicalSpeechSegments = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] => selectCanonicalSpeech(messages).segments;
