import { useFlueAgent } from "@flue/react";
import {
  createFlueClient,
  type FlueClient,
  type FlueConversationMessage,
} from "@flue/sdk";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";

import { LOCAL_UI_PRINCIPAL } from "../conversation/payload.ts";
import { CHAT_AGENT_ROUTE } from "../http/routes.ts";

type ChatConfiguration =
  | {
      readonly mode: "writable";
      readonly principalKey: typeof LOCAL_UI_PRINCIPAL;
      readonly conversationId: string;
    }
  | {
      readonly mode: "observe";
      readonly principalKey: typeof LOCAL_UI_PRINCIPAL;
      readonly conversationId: string;
    }
  | {
      readonly mode: "observer-error";
      readonly message: string;
    };

const chatConfiguration = (): ChatConfiguration => {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("mode") !== "observe") {
    return {
      mode: "writable",
      principalKey: LOCAL_UI_PRINCIPAL,
      conversationId: crypto.randomUUID(),
    };
  }

  const principalKey = parameters.get("principal");
  const conversationId = parameters.get("id")?.trim();
  if (principalKey !== LOCAL_UI_PRINCIPAL) {
    return {
      mode: "observer-error",
      message: `Observer principal must be "${LOCAL_UI_PRINCIPAL}".`,
    };
  }
  if (!conversationId) {
    return {
      mode: "observer-error",
      message: "Observer conversation id is required.",
    };
  }

  return {
    mode: "observe",
    principalKey: LOCAL_UI_PRINCIPAL,
    conversationId,
  };
};

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

function ChatConversation({
  client,
  readOnly,
}: {
  client: FlueClient;
  readOnly: boolean;
}) {
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
          <p className="eyebrow">
            {readOnly ? "Brunch / Flue observer" : "Brunch / Flue chat"}
          </p>
          <h1>
            {readOnly ? "Canonical conversation" : "Plain Flue conversation"}
          </h1>
        </div>
        <span className={`status status--${agent.status}`}>
          {readOnly ? `read-only · ${agent.status}` : agent.status}
        </span>
      </header>

      <section className="transcript" aria-live="polite" aria-busy={busy}>
        {agent.messages.map((message) => (
          <VisibleMessage key={message.id} message={message} />
        ))}
        {agent.error ? <p className="error">{agent.error.message}</p> : null}
      </section>

      {readOnly ? null : (
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
      )}
    </main>
  );
}

export function Chat() {
  const configuration = useMemo(chatConfiguration, []);
  const [client, setClient] = useState<FlueClient>();

  useEffect(() => {
    if (configuration.mode === "observer-error") return;

    let cancelled = false;
    void flueConversationIdWeb(configuration).then((instanceId) => {
      if (cancelled) return;
      setClient(
        createFlueClient({
          url: `/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
          headers: agentOwnershipHeaders(configuration),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [configuration]);

  if (configuration.mode === "observer-error") {
    return (
      <main className="shell">
        <header className="masthead">
          <div>
            <p className="eyebrow">Brunch / Flue observer</p>
            <h1>Observer unavailable</h1>
          </div>
          <span className="status status--error">read-only · error</span>
        </header>
        <section className="transcript">
          <p className="error">{configuration.message}</p>
        </section>
      </main>
    );
  }

  if (client === undefined) {
    return (
      <main className="shell">
        <header className="masthead">
          <div>
            <p className="eyebrow">
              {configuration.mode === "observe"
                ? "Brunch / Flue observer"
                : "Brunch / Flue chat"}
            </p>
            <h1>
              {configuration.mode === "observe"
                ? "Canonical conversation"
                : "Plain Flue conversation"}
            </h1>
          </div>
          <span className="status status--connecting">
            {configuration.mode === "observe"
              ? "read-only · connecting"
              : "connecting"}
          </span>
        </header>
      </main>
    );
  }

  return (
    <ChatConversation
      client={client}
      readOnly={configuration.mode === "observe"}
    />
  );
}
