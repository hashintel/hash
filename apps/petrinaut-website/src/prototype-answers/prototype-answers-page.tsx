/**
 * PROTOTYPE (FE-1594 review, throwaway): the branch's real transcript, card
 * and composer over fixture turns, with the open design questions as switches.
 * The variants rewrite the turn's parts before the real code renders them, so
 * nothing in the library is changed.
 */
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

import {
  coversTurn,
  type OfferedQuestions,
} from "../../../../libs/@hashintel/brunch-agent/src/conversation/question-kinds";
import { BrunchTranscript } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/brunch-transcript";
import { AiAssistantComposer } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/composer";
import { getMessageRenderItems } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/get-message-render-items";
import { TestEditorApi } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/testing/create-test-editor-api";
import {
  type ComposerEdit,
  PrototypeComposerCard,
} from "./prototype-answers-composer-card";
import {
  type PrototypeScenario,
  prototypeScenarios,
} from "./prototype-answers-scenarios";

import type { MessageHandlersRef } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/shared/transcript-props";
import type { PetrinautAiMessage } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/types";

export const prototypeVariants = [
  {
    id: "built",
    label: "As built",
    note: "One card per offer; a question asked again is removed from the earlier card. Each card decides alone whether a click sends.",
  },
  {
    id: "merged",
    label: "A. One card for the turn",
    note: "Every question the turn offered on one card, each from its latest offer. Send or draft is decided over the whole turn.",
  },
  {
    id: "last",
    label: "B. Last offer only",
    note: "Only the turn's last offer shows. Earlier offers are dropped whole.",
  },
] as const;
export type PrototypeVariant = (typeof prototypeVariants)[number]["id"];

export type PrototypeAnswersSearch = {
  scenario: string;
  variant: PrototypeVariant;
  /** Question 3: whether a click that sends leaves typed text in the composer. */
  keepDraft: boolean;
  /**
   * Where free text is typed: in a field on the card (as built), or in the
   * composer, with no text fields on the card at all.
   */
  freeText: "card" | "composer";
};

type Part = PetrinautAiMessage["parts"][number];
type OfferPart = Part & {
  state: string;
  input: OfferedQuestions;
};

const isSettledOffer = (part: Part): part is OfferPart =>
  part.type === "tool-offer_answers" &&
  (part as { state?: string }).state === "output-available";

const applyVariant = (parts: Part[], variant: PrototypeVariant): Part[] => {
  const offers = parts.filter(isSettledOffer);
  const last = offers.at(-1);
  if (variant === "built" || offers.length < 2 || !last) return parts;
  if (variant === "last")
    return parts.filter((part) => !isSettledOffer(part) || part === last);

  // A Map keeps a key's first position and takes its latest value.
  const byLabel = new Map<string, OfferedQuestions["questions"][number]>();
  for (const { input } of offers)
    for (const question of input.questions)
      byLabel.set(question.label.trim().toLowerCase(), question);
  return parts.flatMap((part) => {
    if (!isSettledOffer(part)) return [part];
    if (part !== last) return [];
    return [
      {
        ...part,
        input: { questions: [...byLabel.values()] },
      } as unknown as Part,
    ];
  });
};

const clickEffect = (offer: OfferedQuestions) => {
  if (!coversTurn(offer)) return "a click drafts into the composer";
  return offer.questions.length > 1
    ? 'clicks select; "Send answers" sends'
    : "a click sends at once";
};

const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  margin: 0,
};
const boxStyle: CSSProperties = {
  border: "1px dashed #c9a227",
  background: "#fffbea",
  borderRadius: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.45,
  color: "#3b3000",
};
const headingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "12px 0 4px",
};
const buttonStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #444",
  background: active ? "#fff" : "transparent",
  color: active ? "#111" : "#eee",
  fontSize: 13,
  cursor: "pointer",
});

const noop = () => {};

const Stage = ({
  scenario,
  variant,
  keepDraft,
  freeText,
}: {
  scenario: PrototypeScenario;
  variant: PrototypeVariant;
  keepDraft: boolean;
  freeText: PrototypeAnswersSearch["freeText"];
}) => {
  const [caret, setCaret] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = (body: string, from: "card" | "composer") => {
    setSent((current) => [...current, body]);
    setLog((current) => [
      ...current,
      `${from === "card" ? "Card click" : "Composer"} SENT:\n${body}`,
    ]);
  };
  const handlersRef: MessageHandlersRef = useRef({ onRetryMessage: noop });
  useLayoutEffect(() => {
    handlersRef.current = {
      onRetryMessage: noop,
      onSendAnswer: (body) => {
        send(body, "card");
        if (!keepDraft && input !== "") {
          setLog((current) => [...current, `Typed text DISCARDED:\n${input}`]);
          setInput("");
        }
      },
      onDraftAnswer: (fill) => {
        const draft = fill(input);
        setInput(draft);
        setLog((current) => [...current, `Card click DRAFTED into composer`]);
        inputRef.current?.focus({ preventScroll: true });
      },
    };
  });

  const sendFromCard = (body: string) => {
    send(body, "card");
    if (!keepDraft && input !== "") {
      setLog((current) => [...current, `Typed text DISCARDED:\n${input}`]);
      setInput("");
    }
  };
  const compose = (edit: ComposerEdit, note: string) => {
    const next = edit(input);
    setInput(next.text);
    setCaret(next.caret);
    setLog((current) => [...current, note]);
  };
  useLayoutEffect(() => {
    if (caret === null) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.setSelectionRange(caret, caret);
    setCaret(null);
  }, [caret]);

  const variantParts = applyVariant(scenario.parts, variant);
  const assistant = {
    id: "assistant",
    role: "assistant",
    // The prototype card is drawn by this page, so the real one is left out.
    parts:
      freeText === "composer"
        ? variantParts.filter((part) => part.type !== "tool-offer_answers")
        : variantParts,
  } as PetrinautAiMessage;
  const offered = getMessageRenderItems({
    id: "assistant",
    role: "assistant",
    parts: variantParts,
  } as PetrinautAiMessage).cards.flatMap((card) =>
    card.type === "answers" ? [card.offer] : [],
  );
  const messages = [
    {
      id: "user",
      role: "user",
      parts: [{ type: "text", text: scenario.user }],
    } as PetrinautAiMessage,
    assistant,
    ...sent.map(
      (body, index) =>
        ({
          id: `sent-${index}`,
          role: "user",
          parts: [{ type: "text", text: body }],
        }) as PetrinautAiMessage,
    ),
  ];
  const cards = offered;
  const offerParts = scenario.parts.filter(
    (part) => part.type === "tool-offer_answers",
  ) as unknown as { state: string; input: OfferedQuestions }[];

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [sent.length]);

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <TestEditorApi>
        <section
          aria-label="Brunch chat (prototype)"
          className="petrinaut-root"
          style={{
            display: "flex",
            flexDirection: "column",
            width: 400,
            height: "min(820px, calc(100vh - 220px))",
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "#fff",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            ref={scrollRef}
            data-testid="ai-transcript"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: 12,
            }}
          >
            <BrunchTranscript
              handlersRef={handlersRef}
              interactiveTools={[]}
              stopped={false}
              noReply={false}
              busy={false}
              canRetry={false}
              voice={false}
              messages={messages}
            />
            {freeText === "composer" &&
              sent.length === 0 &&
              offered.map((offer, index) => (
                <PrototypeComposerCard
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture order
                  key={index}
                  offer={offer}
                  onSend={sendFromCard}
                  onCompose={compose}
                />
              ))}
          </div>
          <div style={{ padding: 12, borderTop: "1px solid #ddd" }}>
            <AiAssistantComposer
              busy={false}
              disabled={false}
              hasHistory
              input={input}
              inputRef={inputRef}
              isOpen
              onInputChange={setInput}
              onStop={noop}
              onSubmit={() => {
                if (input.trim() === "") return;
                send(input, "composer");
                setInput("");
              }}
              presentation="brunch"
              textEntry
              voiceModeAvailable={false}
            />
          </div>
        </section>
      </TestEditorApi>

      <aside style={{ ...boxStyle, width: 460 }} data-prototype-state>
        <strong>{scenario.title}</strong>
        <p style={{ margin: "6px 0 0" }}>{scenario.watch}</p>

        <div style={headingStyle}>What the model offered</div>
        {offerParts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture order
          <pre key={index} style={mono}>
            {`Offer ${index + 1}${part.state === "output-error" ? " (REJECTED by the server)" : ""}: ${part.input.questions
              .map(({ label, kind }) => `${label} [${kind}]`)
              .join(", ")}`}
          </pre>
        ))}

        <div style={headingStyle}>Cards shown under this variant</div>
        {sent.length > 0 ? (
          <pre style={mono}>
            None: a message was sent, so the turn's cards are gone.
          </pre>
        ) : cards.length === 0 ? (
          <pre style={mono}>None.</pre>
        ) : (
          cards.map((offer, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed fixture order
            <pre key={index} style={mono}>
              {`Card ${index + 1}: ${offer.questions
                .map(({ label, kind }) => `${label} [${kind}]`)
                .join(", ")}\n  → ${clickEffect(offer)}`}
            </pre>
          ))
        )}

        <div style={headingStyle}>Composer text</div>
        <pre style={mono}>{input === "" ? "(empty)" : input}</pre>

        <div style={headingStyle}>What happened</div>
        {log.length === 0 ? (
          <pre style={mono}>Nothing yet. Click an answer or type.</pre>
        ) : (
          log.map((entry, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
            <pre key={index} style={{ ...mono, marginBottom: 6 }}>
              {`${index + 1}. ${entry}`}
            </pre>
          ))
        )}
      </aside>
    </div>
  );
};

export const PrototypeAnswersPage = ({
  search,
  onSearchChange,
}: {
  search: PrototypeAnswersSearch;
  onSearchChange: (patch: Partial<PrototypeAnswersSearch>) => void;
}) => {
  const [run, setRun] = useState(0);
  const index = Math.max(
    0,
    prototypeScenarios.findIndex(({ id }) => id === search.scenario),
  );
  const scenario = prototypeScenarios[index] ?? prototypeScenarios[0]!;
  const variant =
    prototypeVariants.find(({ id }) => id === search.variant) ??
    prototypeVariants[0];
  const step = (by: number) => {
    const next =
      prototypeScenarios[
        (index + by + prototypeScenarios.length) % prototypeScenarios.length
      ];
    if (next) onSearchChange({ scenario: next.id });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f2",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          marginBottom: 16,

          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          borderRadius: 12,
          background: "#1c1c1c",
          color: "#eee",
          fontSize: 13,
          maxWidth: "calc(100vw - 32px)",
          zIndex: 1000,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "#f5c542" }}>PROTOTYPE</span>
          <button
            type="button"
            style={buttonStyle(false)}
            onClick={() => step(-1)}
          >
            ←
          </button>
          <select
            aria-label="Scenario"
            value={scenario.id}
            onChange={(event) =>
              onSearchChange({ scenario: event.target.value })
            }
            style={{ padding: 6, borderRadius: 6, fontSize: 13, minWidth: 330 }}
          >
            {prototypeScenarios.map(({ id, title }) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={buttonStyle(false)}
            onClick={() => step(1)}
          >
            →
          </button>
          <button
            type="button"
            style={buttonStyle(false)}
            onClick={() => setRun((current) => current + 1)}
          >
            Reset
          </button>
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              whiteSpace: "nowrap",
            }}
          >
            <input
              type="checkbox"
              checked={search.keepDraft}
              onChange={(event) =>
                onSearchChange({ keepDraft: event.target.checked })
              }
            />
            Keep typed text when a click sends
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Several offers in a turn:</span>
          {prototypeVariants.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              style={buttonStyle(id === variant.id)}
              onClick={() => onSearchChange({ variant: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ color: "#bbb", maxWidth: 760 }}>{variant.note}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Free text is typed:</span>
          {(
            [
              ["card", "In a field on the card (as built)"],
              ["composer", "In the composer; no fields on the card"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              style={buttonStyle(id === search.freeText)}
              onClick={() => onSearchChange({ freeText: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Stage
        key={`${scenario.id}-${variant.id}-${String(search.keepDraft)}-${search.freeText}-${run}`}
        freeText={search.freeText}
        scenario={scenario}
        variant={variant.id}
        keepDraft={search.keepDraft}
      />
    </div>
  );
};
