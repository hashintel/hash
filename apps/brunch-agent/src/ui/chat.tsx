import { useFlueAgent } from "@flue/react";
import {
  createFlueClient,
  type FlueClient,
  type FlueConversationMessage,
} from "@flue/sdk";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { flueConversationIdWeb } from "../conversation-identity-web.ts";
import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  LOCAL_UI_PRINCIPAL,
} from "../conversation-payload.ts";
import { CHAT_AGENT_ROUTE } from "../routes.ts";

function VisibleMessage({ message }: { message: FlueConversationMessage }) {
  if (
    message.display !== "visible" ||
    (message.purpose !== "user" && message.purpose !== "assistant")
  ) {
    return null;
  }

  return (
    <article className={`message message--${message.role}`}>
      <p className="message__role">
        {message.role === "user" ? "You" : "Assistant"}
      </p>
      {message.parts.map((part, partIndex) => {
        if (part.type === "text") {
          return (
            // oxlint-disable-next-line react/no-array-index-key -- Flue text parts expose no stable identifier.
            <p className="message__text" key={partIndex}>
              {part.text}
            </p>
          );
        }
        return null;
      })}
    </article>
  );
}

function ChatConversation({ client }: { client: FlueClient }) {
  const [input, setInput] = useState("");
  const agent = useFlueAgent({ client });

  const busy =
    agent.status === "connecting" ||
    agent.status === "submitted" ||
    agent.status === "streaming";

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const reply = input.trim();
    if (!reply || busy) return;
    setInput("");
    void agent.sendMessage(reply);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Brunch / Flue chat</p>
          <h1>Plain Flue conversation</h1>
        </div>
        <span className={`status status--${agent.status}`}>{agent.status}</span>
      </header>

      <section className="transcript" aria-live="polite" aria-busy={busy}>
        {agent.messages.map((message) => (
          <VisibleMessage key={message.id} message={message} />
        ))}
        {agent.error ? <p className="error">{agent.error.message}</p> : null}
      </section>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="reply">Your message</label>
        <div className="composer__row">
          <textarea
            id="reply"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask something."
            rows={3}
          />
          <button type="submit" disabled={busy || input.trim().length === 0}>
            Send
          </button>
        </div>
      </form>
    </main>
  );
}

export function Chat() {
  const conversationId = useMemo(() => crypto.randomUUID(), []);
  const [client, setClient] = useState<FlueClient>();

  useEffect(() => {
    let cancelled = false;
    void flueConversationIdWeb(LOCAL_UI_PRINCIPAL, conversationId).then(
      (instanceId) => {
        if (cancelled) return;
        setClient(
          createFlueClient({
            url: `/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
            headers: {
              [BRUNCH_PRINCIPAL_HEADER]: LOCAL_UI_PRINCIPAL,
              [BRUNCH_CONVERSATION_HEADER]: conversationId,
            },
          }),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (client === undefined) {
    return (
      <main className="shell">
        <header className="masthead">
          <div>
            <p className="eyebrow">Brunch / Flue chat</p>
            <h1>Plain Flue conversation</h1>
          </div>
          <span className="status status--connecting">connecting</span>
        </header>
      </main>
    );
  }

  return <ChatConversation client={client} />;
}
