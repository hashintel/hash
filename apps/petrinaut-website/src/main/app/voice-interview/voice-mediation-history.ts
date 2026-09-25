import { z } from "zod";

import type {
  VoiceBriefFields,
  VoiceLine,
} from "../../../shared/voice-mediation";
import type { FlueConversationState } from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const lineSchema = z.object({
  text: z.string().max(32_000),
  state: z.enum(["streaming", "done"]),
});
const turnSchema = z.object({
  id: z.string(),
  text: z.string().max(32_000),
  submissionId: z.string().optional(),
  canonicalId: z.string().optional(),
  responseIds: z.array(z.string()),
  anchorOnly: z.boolean().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  reply: lineSchema.optional(),
  wrapUp: lineSchema.optional(),
});
type Turn = z.infer<typeof turnSchema>;

/** Browser-local presentation only. Never a source of admission, tools or speech replay. */
export class VoiceMediationHistory {
  readonly #key: string;
  readonly #storage?: Pick<Storage, "getItem" | "setItem">;
  readonly #turns = new Map<string, Turn>();
  readonly #pending = new Set<string>();
  readonly #listeners = new Set<() => void>();
  #projection = (messages: PetrinautAiMessage[]) => this.project(messages);

  public constructor(
    conversationId: string,
    storage?: Pick<Storage, "getItem" | "setItem">,
  ) {
    this.#key = `petrinaut:voice-mediation:v1:${conversationId}`;
    this.#storage = storage;
    try {
      const saved = z
        .array(turnSchema)
        .max(100)
        .parse(JSON.parse(storage?.getItem(this.#key) ?? "[]"));
      for (const turn of saved) {
        if (!turn.submissionId && !turn.anchorOnly) continue;
        if (turn.reply) turn.reply.state = "done";
        if (turn.wrapUp) turn.wrapUp.state = "done";
        this.#turns.set(turn.id, turn);
      }
    } catch {
      /* Corrupt or unavailable browser storage never blocks canonical history. */
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  public getSnapshot = (): typeof this.project => this.#projection;

  #publish(): void {
    this.#projection = (messages) => this.project(messages);
    try {
      this.#storage?.setItem(
        this.#key,
        JSON.stringify(
          [...this.#turns.values()]
            .filter((turn) => turn.submissionId || turn.anchorOnly)
            .slice(-100),
        ),
      );
    } catch {
      /* Quota or disabled storage leaves this session usable. */
    }
    for (const listener of this.#listeners) listener();
  }

  public begin(input: { id: string; text: string }): void {
    this.#turns.set(input.id, { ...input, responseIds: [] });
    this.#pending.add(input.id);
    this.#publish();
  }
  public prepared(id: string, fields: VoiceBriefFields): void {
    const turn = this.#turns.get(id);
    if (turn) {
      turn.fields = fields;
      this.#publish();
    }
  }
  public admitted(id: string, submissionId: string): void {
    const turn = this.#turns.get(id);
    if (turn) {
      turn.submissionId = submissionId;
      this.#publish();
    }
  }
  public failed(id: string): void {
    this.#pending.delete(id);
    this.#publish();
  }
  public settled(id: string, responseIds: string[]): void {
    const turn = this.#turns.get(id);
    if (turn) {
      turn.responseIds = responseIds;
      this.#publish();
    }
  }
  public result(id: string, responseIds: string[]): void {
    this.#turns.set(id, { id, text: "", responseIds, anchorOnly: true });
    this.#publish();
  }
  public caption = (
    id: string,
    kind: "reply" | "wrapUp",
    line: VoiceLine,
  ): void => {
    const turn = this.#turns.get(id);
    if (
      !turn ||
      (turn[kind]?.text === line.text && turn[kind].state === line.state)
    )
      return;
    turn[kind] = line;
    this.#publish();
  };

  public sync(snapshot: FlueConversationState | undefined): void {
    if (!snapshot) return;
    let changed = false;
    for (const turn of this.#turns.values()) {
      if (!turn.submissionId) continue;
      const user = snapshot.messages.find(
        (message) =>
          message.role === "user" && message.submissionId === turn.submissionId,
      );
      if (user && turn.canonicalId !== user.id) {
        turn.canonicalId = user.id;
        changed = true;
      }
      const responseSubmissionId =
        snapshot.settlements.find(
          (settlement) => settlement.submissionId === turn.submissionId,
        )?.answeredBySubmissionId ?? turn.submissionId;
      const responseIds = snapshot.messages
        .filter(
          (message) =>
            message.role === "assistant" &&
            message.submissionId === responseSubmissionId,
        )
        .map((message) => message.id);
      for (const id of responseIds) {
        if (!turn.responseIds.includes(id)) {
          turn.responseIds.push(id);
          changed = true;
        }
      }
    }
    if (changed) this.#publish();
  }

  public project = (messages: PetrinautAiMessage[]): PetrinautAiMessage[] => {
    const turns = [...this.#turns.values()];
    const inputIds = new Set(messages.map((message) => message.id));
    const pending: PetrinautAiMessage[] = turns
      .filter(
        (turn) =>
          this.#pending.has(turn.id) &&
          !inputIds.has(turn.id) &&
          !(turn.canonicalId && inputIds.has(turn.canonicalId)),
      )
      .map((turn) => ({
        id: turn.id,
        role: "user",
        parts: [{ type: "text", text: turn.text }],
      }));
    const canonical = [...messages, ...pending];
    const result: PetrinautAiMessage[] = [];
    const spoken = (
      turn: Turn,
      kind: "reply" | "wrapUp",
    ): PetrinautAiMessage => ({
      id: `voice-${kind === "reply" ? "reply" : "wrap-up"}:${turn.id}`,
      role: "assistant",
      metadata: { source: "voice" },
      parts: [
        {
          type:
            kind === "reply" ? "data-voiceAgentReply" : "data-voiceAgentWrapUp",
          data: turn[kind],
        },
      ],
    });
    for (const message of canonical) {
      const turn =
        message.role === "user"
          ? turns.find(
              (candidate) =>
                candidate.id === message.id ||
                candidate.canonicalId === message.id,
            )
          : undefined;
      if (turn) {
        result.push({
          ...message,
          metadata: { ...message.metadata, source: "voice" },
          parts: [
            { type: "text", text: turn.text },
            ...(turn.fields && turn.submissionId
              ? [
                  {
                    type: "data-brief" as const,
                    data: { fields: turn.fields, state: "done" },
                  },
                ]
              : []),
          ],
        });
        if (turn.reply?.text) result.push(spoken(turn, "reply"));
      } else result.push(message);
      for (const candidate of turns) {
        if (!candidate.wrapUp?.text) continue;
        const lastResponse = canonical.findLast((entry) =>
          candidate.responseIds.includes(entry.id),
        );
        if (lastResponse?.id === message.id)
          result.push(spoken(candidate, "wrapUp"));
      }
    }
    return result;
  };
}
