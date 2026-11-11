/**
 * PROTOTYPE (FE-1594, throwaway): Brunch's questions docked on the composer,
 * on the branch's real transcript and composer over fixture turns. Nothing
 * about the questions is drawn in the chat stream.
 */
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { BrunchTranscript } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/brunch-transcript";
import { AiAssistantComposer } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/composer";
import { TestEditorApi } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/testing/create-test-editor-api";
import {
  answerText,
  composeDockMessage,
  type DockAnswer,
  emptyAnswer,
  PrototypeDock,
} from "./prototype-dock";
import {
  type DockScenario,
  dockScenarios,
  fullReply,
} from "./prototype-dock-scenarios";

import type { MessageHandlersRef } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/ai-assistant-contents/shared/transcript-props";
import type { PetrinautAiMessage } from "../../../../libs/@hashintel/brunch-agent/src/ui/chat/ai-assistant-panel/types";

export type PrototypeDockSearch = {
  scenario: string;
  /** Rows with label and value, or a row of label-only buttons. */
  form: "list" | "buttons";
  /** Where the person's own words are typed. */
  other: "inline" | "composer";
  /** Whether a question takes one answer or several. */
  select: "single" | "multiple";
  /** Whether the reply states the questions, or only leads into them. */
  reply: "full" | "brief";
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
const rowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const noop = () => {};

const Stage = ({
  scenario,
  search,
}: {
  scenario: DockScenario;
  search: PrototypeDockSearch;
}) => {
  const { questions } = scenario;
  const multiple = search.select === "multiple";
  const [answers, setAnswers] = useState<DockAnswer[]>(() =>
    questions.map(() => emptyAnswer),
  );
  const [current, setCurrent] = useState(0);
  /** What is typed in the composer while it isn't a question's answer. */
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [focusComposer, setFocusComposer] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handlersRef: MessageHandlersRef = useRef({ onRetryMessage: noop });

  const docked = sent.length === 0;
  const question = questions[current];
  const answer = answers[current] ?? emptyAnswer;
  /** The composer holds the showing question's own words. */
  const bound = docked && search.other === "composer";
  const last = current === questions.length - 1;

  const update = (index: number, change: (answer: DockAnswer) => DockAnswer) =>
    answers.map((each, position) => (position === index ? change(each) : each));

  const send = (finalAnswers: readonly DockAnswer[], from: string) => {
    const body = composeDockMessage(questions, finalAnswers, bound ? "" : note);
    if (body === undefined) return;
    setSent((messages) => [...messages, body]);
    setNote("");
    setLog((entries) => [...entries, `${from} SENT:\n${body}`]);
  };

  const pick = (position: number) => {
    const next = update(current, (each) =>
      multiple
        ? {
            ...each,
            picked: each.picked.includes(position)
              ? each.picked.filter((other) => other !== position)
              : [...each.picked, position],
          }
        : { ...each, picked: [position], ownOn: false },
    );
    setAnswers(next);
    if (multiple) return;
    // One question, one choice: the click is the whole answer.
    if (questions.length === 1) send(next, "A click");
    else if (!last) setCurrent(current + 1);
  };
  const toggleOther = () => {
    const turningOn = !answer.ownOn;
    setAnswers(
      update(current, (each) => ({
        ...each,
        ownOn: turningOn,
        picked: turningOn && !multiple ? [] : each.picked,
      })),
    );
    if (turningOn && search.other === "composer")
      setFocusComposer((count) => count + 1);
  };
  const setOwn = (text: string) =>
    setAnswers(
      update(current, (each) => ({
        ...each,
        own: text,
        ownOn: text !== "" || each.ownOn,
        picked: text !== "" && !multiple ? [] : each.picked,
      })),
    );

  // A question answered only by typing takes the cursor when it shows.
  useEffect(() => {
    if (bound && question?.options.length === 0)
      setFocusComposer((count) => count + 1);
  }, [bound, current, question]);
  useLayoutEffect(() => {
    if (focusComposer > 0) inputRef.current?.focus({ preventScroll: true });
  }, [focusComposer]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [sent.length]);

  const messages = [
    {
      id: "user",
      role: "user",
      parts: [{ type: "text", text: scenario.user }],
    },
    {
      id: "assistant",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: search.reply === "full" ? fullReply(scenario) : scenario.lead,
          state: "done",
        },
      ],
    },
    ...sent.map((body, index) => ({
      id: `sent-${index}`,
      role: "user",
      parts: [{ type: "text", text: body }],
    })),
  ] as unknown as PetrinautAiMessage[];

  const preview = composeDockMessage(questions, answers, bound ? "" : note);

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
            height: "min(860px, calc(100vh - 230px))",
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
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 12,
              borderTop: "1px solid #ddd",
            }}
          >
            {docked && (
              <PrototypeDock
                questions={questions}
                answers={answers}
                current={current}
                form={search.form}
                other={search.other}
                multiple={multiple}
                onCurrent={setCurrent}
                onPick={pick}
                onOther={toggleOther}
                onOwn={setOwn}
                onSend={() => send(answers, "Send button")}
              />
            )}
            <AiAssistantComposer
              busy={false}
              disabled={false}
              hasHistory
              input={bound ? answer.own : note}
              inputRef={inputRef}
              isOpen
              onInputChange={bound ? setOwn : setNote}
              onStop={noop}
              onSubmit={() => {
                // Enter on a question that isn't the last moves on.
                if (bound && !last) setCurrent(current + 1);
                else send(answers, "The composer");
              }}
              presentation="brunch"
              textEntry
              voiceModeAvailable={false}
            />
          </div>
        </section>
      </TestEditorApi>

      <aside style={{ ...boxStyle, width: 480 }} data-prototype-state>
        <strong>{scenario.title}</strong>
        <p style={{ margin: "6px 0 0" }}>{scenario.watch}</p>

        <div style={headingStyle}>What the model sent with its reply</div>
        {questions.map((each, index) => (
          <pre key={each.label} style={mono}>
            {`${index + 1}. ${each.label} — ${
              each.options.length === 0
                ? "no options (typed)"
                : each.options.map(({ label }) => label).join(" | ")
            }`}
          </pre>
        ))}

        <div style={headingStyle}>Answers so far</div>
        {questions.map((each, index) => (
          <pre key={each.label} style={mono}>
            {`${index + 1}. ${each.label}: ${
              answerText(each, answers[index] ?? emptyAnswer) ?? "—"
            }`}
          </pre>
        ))}

        <div style={headingStyle}>
          {docked ? "The message a send would produce now" : "Sent"}
        </div>
        <pre style={mono}>
          {docked ? (preview ?? "(nothing to send yet)") : sent.join("\n\n")}
        </pre>

        <div style={headingStyle}>What happened</div>
        {log.length === 0 ? (
          <pre style={mono}>Nothing yet.</pre>
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

const Choice = <Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly (readonly [Value, string])[];
  onChange: (value: Value) => void;
}) => (
  <div style={rowStyle}>
    <span style={{ minWidth: 150 }}>{label}</span>
    {options.map(([id, text]) => (
      <button
        key={id}
        type="button"
        style={buttonStyle(id === value)}
        onClick={() => onChange(id)}
      >
        {text}
      </button>
    ))}
  </div>
);

export const PrototypeDockPage = ({
  search,
  onSearchChange,
}: {
  search: PrototypeDockSearch;
  onSearchChange: (patch: Partial<PrototypeDockSearch>) => void;
}) => {
  const [run, setRun] = useState(0);
  const index = Math.max(
    0,
    dockScenarios.findIndex(({ id }) => id === search.scenario),
  );
  const scenario = dockScenarios[index] ?? dockScenarios[0];
  if (!scenario) return null;
  const step = (by: number) => {
    const next =
      dockScenarios[(index + by + dockScenarios.length) % dockScenarios.length];
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
        }}
      >
        <div style={rowStyle}>
          <span style={{ fontWeight: 700, color: "#f5c542" }}>
            PROTOTYPE · questions docked on the composer
          </span>
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
            style={{ padding: 6, borderRadius: 6, fontSize: 13, minWidth: 360 }}
          >
            {dockScenarios.map(({ id, title }) => (
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
            onClick={() => setRun((count) => count + 1)}
          >
            Reset
          </button>
        </div>
        <Choice
          label="Options are shown as:"
          value={search.form}
          options={[
            ["list", "Rows with label and value (left wireframe)"],
            ["buttons", "Buttons with label only (right wireframe)"],
          ]}
          // Each wireframe pairs a form with a place to type; the next row
          // can change that pairing.
          onChange={(form) =>
            onSearchChange({
              form,
              other: form === "list" ? "inline" : "composer",
            })
          }
        />
        <Choice
          label='"Other" is typed:'
          value={search.other}
          options={[
            ["inline", "In the dock, beside Other"],
            ["composer", "In the message box"],
          ]}
          onChange={(other) => onSearchChange({ other })}
        />
        <Choice
          label="A question takes:"
          value={search.select}
          options={[
            ["single", "One answer"],
            ["multiple", "Several answers"],
          ]}
          onChange={(select) => onSearchChange({ select })}
        />
        <Choice
          label="Brunch's reply:"
          value={search.reply}
          options={[
            ["full", "States every question and its options"],
            ["brief", "Only leads into the questions"],
          ]}
          onChange={(reply) => onSearchChange({ reply })}
        />
      </div>
      <Stage
        key={`${scenario.id}-${search.form}-${search.other}-${search.select}-${search.reply}-${run}`}
        scenario={scenario}
        search={search}
      />
    </div>
  );
};
