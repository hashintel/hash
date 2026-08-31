# AI Assistant

Petrinaut has an in-app AI assistant that can build a net from a natural-language description, review or revise an existing one, read TypeScript compilation diagnostics, and consult its own user-guide pages to answer "how do I ..." questions. The host application controls whether the assistant is available -- it is enabled on [demo.petrinaut.org](https://demo.petrinaut.org) and in [HASH](https://hash.ai) and may or may not be enabled in other Petrinaut embeds.

## Opening the panel

There are two entry points:

1. **AI button** in the bottom toolbar (Edit mode only). Click it to open the panel; click again to close. The tooltip is "Show AI assistant" / "Hide AI assistant".
2. **First-run prompt**. When you load Petrinaut against an empty net, a centred prompt appears. Type a description, press send, and the panel opens with your message already in flight. Dismiss the prompt with the **X**, by clicking outside it, or by pressing **Escape**; it is hidden for the rest of the session once dismissed.

The assistant panel only renders in **Edit** mode. Switching to **Simulate** mode hides it; switch back to **Edit** to continue the conversation. The panel resizes by dragging its left edge.

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

When the Brunch voice preview is enabled by the host, the additional control can accept finalized
microphone transcripts and speak finalized assistant responses. Live transcript fragments are
labelled **not sent** and do not enter the conversation. The microphone is off while Brunch is
working or a response is playing. Spoken responses use an AI-generated OpenAI voice, as disclosed
in the voice status panel. If speech fails, the response remains visible to read and the voice
control offers recovery instead of changing or regenerating the text.

If voice cannot continue, the status panel identifies the kind of problem. For microphone
permission or device errors, allow access or connect/select a microphone before reconnecting. For
an interrupted request, network error, or timeout, check the connection and choose **Reconnect
voice input**. If the preview is unavailable, continue with the text composer. An invalid service
response includes a diagnostic reference you can give to an operator; that reference and its
diagnostic record do not contain your transcript or the response being spoken.

**Clear AI chat** via the delete button in the top right of the panel: wipes the conversation, stops any in-flight stream, and tells the host app to forget the messages (if the host persists them).

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

Whether the assistant is available, which additional composer controls appear, where the
conversation is stored (in-memory, in your host app's database, or anywhere else), and the model
behind it are all controlled by the host application that embeds Petrinaut. Read-only documents
and the simulate-mode restrictions described above always apply when applicable.
