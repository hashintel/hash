import {
  ASK_TOOL_NAME,
  parseBrunchAskInput,
} from "@hashintel/brunch-agent/client-tools";

import { hashCanonicalSpeechText } from "../../../canonical-speech-fingerprint";

import type { AgentSendResult } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export { hashCanonicalSpeechText };

export interface CanonicalSpeechSegment {
  readonly contentHash: string;
  readonly id: string;
  readonly messageId: string;
  readonly partId: string;
  readonly source: "assistant-text" | "brunch-ask";
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

export const selectCanonicalSpeechSegments = (
  messages: PetrinautAiMessage[],
): CanonicalSpeechSegment[] => {
  const segments: CanonicalSpeechSegment[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
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
        continue;
      }

      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== ASK_TOOL_NAME ||
        part.state !== "input-available"
      ) {
        continue;
      }

      try {
        const input = parseBrunchAskInput(part.input);
        segments.push(
          createSegment(
            message.id,
            part.toolCallId,
            "brunch-ask",
            input.question,
          ),
        );
      } catch {
        // Malformed tool inputs remain visible as tool errors; they are not spoken.
      }
    }
  }

  return segments;
};
