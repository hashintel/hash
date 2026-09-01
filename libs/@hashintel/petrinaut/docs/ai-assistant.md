# AI Assistant

Petrinaut has an in-app AI assistant that can build a net from a natural-language description, review or revise an existing one, read TypeScript compilation diagnostics, and consult its own user-guide pages to answer "how do I ..." questions. The host application controls whether the assistant is available -- it is enabled on [demo.petrinaut.org](https://demo.petrinaut.org) and in [HASH](https://hash.ai) and may or may not be enabled in other Petrinaut embeds.

## Opening the panel

There are two entry points:

1. **AI button** in the bottom toolbar (Edit mode only). Click it to open the panel; click again to close. The tooltip is "Show AI assistant" / "Hide AI assistant".
2. **First-run prompt**. When you load Petrinaut against an empty net, a centred prompt appears. Type a description and its trailing action becomes **Send**; select it to open the panel with your message already in flight. When the host provides Voice mode, the empty prompt instead shows a waveform action titled **Start voice mode**. It opens the same assistant without creating an empty text message. Dismiss the prompt with the **X**, by clicking outside it, or by pressing **Escape**; it is hidden for the rest of the session once dismissed.

The assistant panel only renders in **Edit** mode. Switching to **Simulate** mode hides it; switch back to **Edit** to continue the conversation. The panel resizes by dragging its left edge. Its header has one **AI** label because text and voice share the same transcript rather than separate chats.

## The conversation

While a response is streaming you can:

- Watch the model's text and reasoning appear live. The **Reasoning** block is collapsible; while it is streaming, it auto-opens, shows a shimmer effect, and (once attached timing information arrives) an elapsed timer.
- Press **Stop AI response** (the send button turns into a stop icon) to halt the current response.
- Type your next message in the composer -- it is queued for after the current response ends.

The application embedding Petrinaut may place an additional control beside the message box. For
example, a host can offer another way to enter finalized text. Text submitted by that control
behaves like text sent with the keyboard: it joins the same conversation and, when an inline
question is waiting for an answer, completes that question rather than starting an unrelated
message. A host can explicitly submit a separate message instead when the text is a correction or
other follow-up that must not answer the pending question.
If the host offers voice input, a finalized spoken turn is held while an existing response
finishes and is submitted when the conversation is ready.

If an assistant request fails, Petrinaut shows the error in a brief toast rather than adding it to
the conversation. Retry from the composer when the assistant is ready.

When the Brunch voice preview is enabled and available, an empty composer shows a waveform action
titled **Start voice mode**. Typing non-whitespace text replaces it with **Send**. The same dynamic
action appears in the first-run prompt and the assistant panel; if voice is unavailable, the empty
composer retains a disabled **Send** action. Starting Voice mode keeps the transcript in place and
opens the existing one-time disclosure above the composer. Review that OpenAI processes live
audio and speaks the interviewer's words while Petrinaut keeps finalized answers in the conversation
rather than the audio. You can check your microphone before confirming that you understand and
selecting **Start voice mode**. Petrinaut remembers that acknowledgement in this browser for the
current disclosure version, so later uses of **Start voice mode** start directly. If browser storage
is unavailable or the disclosure changes, Petrinaut asks again.

While a session runs, the composer is replaced by a low-profile Voice dock at the foot of the panel:
one line of ephemeral caption above a five-bar indicator and one short state -- **Connecting**,
**Listening**, **Thinking**, **Speaking**, **Paused**, or **Voice interrupted**. The bars follow your
microphone while it listens and switch to a restrained looping pattern while the assistant speaks, so
which side holds the turn is readable at a glance. The caption follows the same handover: your words
as they are transcribed, then the question spoken back to you. It is display-only -- never sent,
saved, or scrolled into the conversation.

The conversation itself stays still. Spoken turns are written to it as they happen, because that is
what runs the tools that edit the net, but they stay hidden until the session ends rather than
scrolling the transcript mid-sentence. Two things are never held back: anything you typed, and any
inline question waiting for your answer. When the session ends, the held turns appear together under
a **Voice session · N turns** divider. Only finalized answers and canonical Brunch text become chat
history; provisional transcription and Realtime audio are ephemeral. Finalized spoken user messages
and the exact inline answer completed by speech keep a small waveform mark, so Voice provenance
remains visible without duplicating an answer.

The microphone stays on while the interviewer speaks, so speaking naturally interrupts the audio
and starts listening to you; you do not need to select an interrupt action. Semantic voice detection
finishes each answer automatically after a natural pause and is tuned to allow longer thinking
pauses. There is no required done-speaking action.

Session controls sit in their own small glass segment just above the bottom toolbar, next to the
canvas rather than inside the panel: **Pause voice mode** (**Resume voice mode** once paused) and
**End voice mode**. When that toolbar is not on screen -- a detached or full-screen panel, for
example -- the same two buttons appear in the dock instead, so a session is never left without a way
to stop it. Sending non-empty typed text from the composer or first-run prompt ends Voice mode before
it sends the message once through the same conversation; repeated send actions are ignored while that
short handoff completes.

The interviewer uses a warm, calm, curious, and professionally neutral voice and treats you as the
authority on your system. Brunch still chooses every question and interview decision; OpenAI only
delivers its words. The question and finalized response shown in the Petrinaut conversation are
authoritative. Spoken audio is generated from that Brunch text but may not be verbatim. Interrupting
audio does not undo the visible response or change the interview's saved history.

Closing the AI panel pauses microphone capture and active speech, then hides the dock until you
reopen the panel. The same mounted session stays paused, and its canvas controls stay on screen;
choose **Resume voice mode** when you are ready. **Clear AI chat** is unavailable while a Voice
session is active.

If voice cannot continue, the status reads **Voice interrupted** and the actionable error arrives as
a toast that names the microphone, connection, or Voice failure in one sentence, followed by any
diagnostic reference in parentheses. **Reconnect voice mode** replaces the pause action until the
session recovers. For microphone permission or device errors, allow access or connect/select a
microphone before reconnecting. For an interrupted request, network error, or timeout, check the
connection and reconnect. If the preview is unavailable, continue with the text composer. An invalid
service response includes a diagnostic reference you can give to an operator. That reference and its
diagnostic record do not contain your transcript or the response being spoken. Interview-state
failures use a content-free `interview-correlation`, `interview-response`, or `interview-submission`
code so an operator can distinguish them without receiving your answer.

When no interview is active, **Clear AI chat** via the delete button in the top right of the panel
wipes the conversation, stops any in-flight stream, and tells the host app to forget the messages
(if the host persists them).

## What the assistant can do

The assistant has tools for inspecting and modifying the current net. You'll see one card per tool call inline in the conversation:

- **Read tools** (neutral, expandable) –– for checking the current net state and active Petrinaut extensions at any point, for compilation errors, and for reading the user guide.
- **Mutation tools** (green for additions/updates, red for deletions) -- "Added place X", "Updated transition Y", "Removed metric Z", and so on. Multiple successive mutations group under a collapsible "N changes" header.
- **`setNetTitle`** -- renames the net.
- **`applyAutoLayout`** -- rearranges places and transitions on the canvas. If the assistant calls this on a net you've already arranged, it asks you first via an inline widget with **Yes, auto-layout** / **No, keep current layout** buttons. Otherwise it'll run it without asking.
- **Host-specific questions and actions** -- an application embedding Petrinaut
  may add interactive widgets. For example, an elicitation assistant can ask a
  structured question inline and continue after you submit the answer. The
  control stays visible as a read-only record of your submitted value. During
  elicitation, inline sweep cards may also list the facts captured so far,
  whether earlier facts were superseded or retracted, and any requirements that
  still prevent completion.

Clicking a mutation card usually selects the entity it touched (place, transition, scenario, metric, etc.) so you can inspect what changed.

After applying changes, the assistant may automatically check TypeScript compile diagnostics (you'll see a **Checked net compilation errors** card) and fix problems on its own before continuing.

## Read-only behaviour

Whether the assistant can change the net depends on the editor state:

- **Application marks the document read-only (e.g. you don't have permissions)** -- no mutations at all.
- **Simulation running, paused, or completed** -- the same rule applies (reset the simulation to mutate the structure again).

The composer stays open in all of these cases, so you can still ask questions, request a review, or have the assistant read documentation -- it just won't be able to write changes back until you reset.

## Diagnostics integration

When the assistant edits code surfaces (lambdas, kernels, dynamics, visualizers, metric/scenario code), it sees the resulting TypeScript diagnostics on the next turn and can iteratively fix them. You don't have to relay errors manually -- the post-edit re-check happens automatically. The same diagnostics also appear in the bottom **Diagnostics** tab as usual; the assistant just sees them in addition.

## Host configuration

Whether the assistant is available, which additional composer controls or Voice modes appear, where the
conversation is stored (in-memory, in your host app's database, or anywhere else), and the model
behind it are all controlled by the host application that embeds Petrinaut. Read-only documents
and the simulate-mode restrictions described above always apply when applicable.
