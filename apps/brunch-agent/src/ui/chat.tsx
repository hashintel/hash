import { useFlueAgent } from "@flue/react";
import { createFlueClient, type FlueConversationMessage } from "@flue/sdk";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as v from "valibot";

import { FreeTextAffordance } from "@hashintel/brunch-agent";

import { GHERKIN_AGENT_ROUTE } from "../routes.ts";

const conversationId = crypto.randomUUID();

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
        {message.role === "user" ? "You" : "Interviewer"}
      </p>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <p className="message__text" key={index}>
              {part.text}
            </p>
          );
        }
        if (part.type === "data-affordance") {
          const affordance = v.safeParse(FreeTextAffordance, part.data);
          if (!affordance.success) return null;
          return (
            <section className="question" key={affordance.output.id}>
              <span className="question__index">Question</span>
              <p className="question__markdown">{affordance.output.markdown}</p>
              <span className="question__hint">
                Reply in your own words below.
              </span>
            </section>
          );
        }
        return null;
      })}
    </article>
  );
}

export function Chat() {
  const [input, setInput] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [startupError, setStartupError] = useState<string>();
  const started = useRef(false);
  const client = useMemo(
    () =>
      createFlueClient({
        url: `/agents/${GHERKIN_AGENT_ROUTE}/${conversationId}`,
      }),
    [],
  );
  const agent = useFlueAgent({ client });

  useEffect(() => {
    if (!agent.historyReady || agent.messages.length > 0 || started.current)
      return;
    started.current = true;

    void (async () => {
      try {
        const admission = await client.send({
          message: { kind: "user", body: "Begin the interview." },
          initialData: { targetDocumentId: `dev-${conversationId}` },
        });
        await client.wait(admission);
        agent.refresh();
      } catch (error: unknown) {
        setStartupError(
          error instanceof Error
            ? error.message
            : "The interview could not start.",
        );
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [agent, client]);

  const busy =
    bootstrapping ||
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
          <p className="eyebrow">Brunch / elicitation field notes</p>
          <h1>Tell me how it should behave.</h1>
        </div>
        <span className={`status status--${agent.status}`}>{agent.status}</span>
      </header>

      <section className="transcript" aria-live="polite" aria-busy={busy}>
        {agent.messages.map((message) => (
          <VisibleMessage key={message.id} message={message} />
        ))}
        {agent.messages.length === 0 && !startupError ? (
          <p className="opening">Opening a fresh interview…</p>
        ) : null}
        {startupError ? <p className="error">{startupError}</p> : null}
        {agent.error ? <p className="error">{agent.error.message}</p> : null}
      </section>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="reply">Your reply</label>
        <div className="composer__row">
          <textarea
            id="reply"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Write what you know; uncertainty is useful too."
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
