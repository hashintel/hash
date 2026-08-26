import type { UIMessageChunk } from "ai";

export interface PetrinautChatResult {
  readonly status: number;
  readonly messageId: string | undefined;
  readonly partIds: readonly string[];
  readonly reasoning: string;
  readonly text: string;
  readonly finish: UIMessageChunk | undefined;
  readonly chunks: readonly UIMessageChunk[];
}
