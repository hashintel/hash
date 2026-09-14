# AI Assistant

Petrinaut has an in-app AI assistant that can build a net from a natural-language description, review or revise an existing one, read TypeScript compilation diagnostics, run experiments, and consult its own user-guide pages to answer "how do I ..." questions. The host application controls whether the assistant and its tools are available -- it is enabled on [demo.petrinaut.org](https://demo.petrinaut.org) and in [HASH](https://hash.ai) and may or may not be enabled in other Petrinaut embeds.

## Opening the panel

Open the assistant in any of these ways:

1. **AI button** in the bottom toolbar (Edit mode only). Click it to open the panel; click again to close. The tooltip is "Show AI assistant" / "Hide AI assistant".
2. **File → New → Build with Brunch**. When the host enables its experimental Brunch demo mode, shows net-management controls, and provides an assistant, this creates a fresh empty net, opens the assistant, and offers two chips before the first message: **Interview first** (elicit before inventing missing detail or drawing the net) or **Quick preview** (fill reasonable gaps, mark them as provisional, and wait for assent). **Start blank** creates the same empty net without opening the assistant or showing the first-run prompt. Without that host flag, **New** retains its ordinary direct blank-net behavior.
3. **First-run prompt**. When you load Petrinaut against an empty net, a centred prompt appears. Type a description and its trailing action becomes **Send**; select it to open the panel with your message already in flight. When the host provides Voice mode, the empty prompt instead shows a waveform action titled **Start voice mode**. It opens the same assistant without creating an empty text message. Dismiss the prompt with the **X**, by clicking outside it, or by pressing **Escape**; it is hidden for the rest of the session once dismissed.
4. **Command palette**. Choose **Toggle AI assistant**, or press **Cmd/Ctrl+Shift+K** directly. This opens the assistant and focuses the message field, or closes it when already visible, including compact Voice mode. Reopening preserves the conversation and docked or floating layout. The command keeps you in your current view. This command is available when the host provides an AI assistant.

The assistant stays available across **Edit**, **Simulate**, **Actual**, and **Notebook** modes. Switching views preserves your conversation, draft, and active response. The panel resizes by dragging its left edge. Text and voice share the **AI** transcript. Some hosts add a second tab, such as **Workpiece**, for a saved document. Select a tab to switch views, or use the left/right arrow keys while a tab is focused. Switching does not end a response, clear your draft or interrupt Voice; the composer and active controls remain available.

### Docking and floating

The assistant opens in a sidebar at the far right of the editor. It sits flush against the viewport, beside the canvas and its properties panel. The sidebar slides in at its full width while the canvas makes room. Closing it returns that space to the canvas.

The bottom toolbar stays centered on the editor when the docked assistant opens, moving only as far as needed to avoid overlapping the panels.

Choose **Float AI assistant** in the header to detach it into a rounded panel over the canvas. The canvas expands smoothly to reclaim the sidebar's space, and the floating panel reserves no space at the right edge. Drag anywhere in the header outside the tabs and action buttons to move it, or focus **Move AI assistant** and use the arrow keys. Hold **Shift** with an arrow key to move farther. The floating panel stays within the editor when the window changes size.

Choose **Dock AI assistant** to return it to the right sidebar. Switching between these layouts keeps your draft, conversation, and active response. Both layouts resize from the left edge. Closing and reopening the assistant keeps your layout choice for the editor session.

The header icons animate on hover and click, respecting your reduced-motion preference.

## The conversation

While a response is streaming you can:

- Watch the model's text and reasoning appear live. The **Reasoning** block is collapsible; while it is streaming, it auto-opens, shows a shimmer effect, and (once attached timing information arrives) an elapsed timer.
- Follow tool operations as they run. A spinner and **Preparing…** or **Running…** distinguish an unfinished operation from its completed or failed result; a collapsed group also shows its active status. Preparing is available only when the host streams tool arguments. Brunch currently publishes tool cards after argument validation, so a proposal may still be generating before its card appears. Interactive questions remain waiting for your answer rather than showing a running spinner.
- Press **Stop AI response** (the send button turns into a stop icon) to halt the current response. A host with durable conversation execution can record that stop before Petrinaut cancels its local stream; without that host capability, Stop is local cancellation only. A Stop pressed while the assistant is reading or editing the net also withholds browser tools that have not started and the follow-up reply that would otherwise start automatically. Already-applied changes are not rolled back.
- Type your next message in the composer -- it is queued for after the current response ends.

The assistant's compilation check runs against the current model, even when its diagnostics are unchanged from the previous check. If you edit the model during that check, the result asks for another check instead of claiming the new version compiles. Compilation checks do not establish simulation correctness.

The application embedding Petrinaut may place an additional control beside the message box. For example, a host can offer another way to enter finalized text. Text submitted by that control behaves like text sent with the keyboard: it joins the same conversation and, when an inline question is waiting for an answer, completes that question rather than starting an unrelated message. A host can explicitly submit a separate message instead when the text is a correction or other follow-up that must not answer the pending question.
If the host offers voice input, only a finalized transcript captured while Voice owns the input turn can be submitted. Voice waits while an existing response finishes or yields through the host's handoff control.

If an assistant request fails, Petrinaut shows the complete error in a persistent toast rather than adding it to the conversation. Long errors wrap, diagnostic details can be copied, and the toast stays open until you close it. Retry from the composer when the assistant is ready.

Hosts may provide canonical conversation rehydration. In that case, reopening the same assistant shows its settled and stopped turns without resubmitting a message or replaying Voice audio. Voice markers attached to client-tool results survive that history. A direct spoken user message remains in the transcript after reopening, but its **Voice** chip may not be restored by the current Brunch host. Durably aborted assistant entries retain their **Response stopped** label even after later completed replies. If a tool-call step had already completed when Stop withheld its browser follow-up, that local decision has no durable cancellation record: hosts using initial-history recovery can recover the tool as pending work. Do not treat that local withholding as a reload-safe cancellation.

A host may also enable live history following, as the local Brunch panel does. Turns submitted elsewhere then appear in the open conversation without a reload. Your own in-progress response stays in place until the host confirms that its canonical history has caught up. In this mode, tools observed from another participant or restored after reopening are display-only: watching a pending tool does not execute it or resume that turn. Tools emitted in response to your own local submission still execute normally. A pending externally submitted tool needs its originating participant/operator to resolve it; reopening this following panel is not automatic recovery.

### Workpiece in Brunch

In Brunch construction conversations, the **Workpiece** tab shows the saved account as a readable document. It updates when Brunch saves a revision, without covering the canvas or opening another panel. You can read it while continuing to type in the same composer, then switch to **AI** to inspect the reply. Closing and reopening the assistant retains the selected tab for that mounted conversation.

The revision label describes the recorded account, not a promise of continuing freshness. Warnings remain visible when a later revision exists or an explanation no longer matches the observed net. Ask Brunch to read the workpiece or explain the relevant model part again when you need a fresh answer. **Recorded details** expands the revision identifiers, exact saved Markdown and structured explanation results; those records do not prove the modelling rationale is correct.

### Prepared local demo fixture

The local Petrinaut development demo offers a labelled crew-reservation fixture when Brunch is
configured. Opening it restores a test-authored Markdown workpiece, a non-empty final-inspection
net, and their canonical Brunch conversation. The status panel distinguishes prepared text from
model-produced revisions and states the fixture's non-claims.

The document is mirrored to browser local storage automatically; there is no separate Save action.
Wait for the status panel to report a settled bundle before reopening the same fixture in another
tab. A refused status leaves the previous coherent bundle selected and names the failed history,
workpiece, mutation-correlation, or document check instead of claiming that partial state settled.

When the Brunch voice preview is enabled and available, an empty composer shows a waveform action
titled **Start voice mode**. Typing non-whitespace text replaces it with **Send**. The same dynamic
action appears in the first-run prompt and the assistant panel; if voice is unavailable, the empty
composer retains a disabled **Send** action. Starting Voice mode keeps the transcript in place and
opens the existing one-time disclosure. Voice selected from the first-run prompt starts compact: the
disclosure and microphone check appear in a card immediately above a **Voice setup** dock, while the
AI header, transcript, and composer stay hidden. The card opens without shifting the dock or viewport
controls, and scrolls within the available screen height. Setup does not show **Connecting** before
you start. Select **Expand voice setup** to restore the full
panel. Voice started from the composer keeps that full panel visible. Review that OpenAI processes
live audio and speaks the interviewer's words while Petrinaut keeps finalized answers in the
conversation rather than the audio. You can check your microphone before confirming that you
understand and selecting **Start voice mode**. Petrinaut remembers that acknowledgement in this
browser for the current disclosure version, so later uses of **Start voice mode** start directly. If
browser storage is unavailable or the disclosure changes, Petrinaut asks again.

Some hosts offer a Brunch-backed GPT-Live voice interview. It uses one Live
session for conversational audio and a separate transcription session for
finalized user messages. Brunch remains responsible for domain answers, chat
history, and changes to the net; settled Brunch prose is supplied to Live for
best-effort spoken delivery. Before the first Live session, the permission
panel explains both OpenAI audio streams and text retention, with a permission
checkbox, **Start voice**, and **Cancel**. Petrinaut remembers this
Live-specific versioned acknowledgement in browser storage, so later Live
sessions start directly. A failed or ended acknowledged session offers
**Retry voice** without showing the consent prompt again. Browser microphone
permission remains separate.
**Cancel** returns to text without starting one. If the browser blocks remote
playback, the dock keeps the warning visible and offers **Play voice audio**;
selecting it retries playback from that user gesture. Closing the panel or
selecting **End voice mode** ends Live audio, transcription, microphone
capture, and playback. A connection error never retries automatically.

While Voice runs, the composer is replaced by a compact dock at the foot of the
panel. It shows one short state -- **Connecting**, **Listening**, **Muted**,
**Thinking**, **Speaking**, **Paused**, or **Voice interrupted** -- and keeps
the controls available without covering the transcript. Select **Hide
conversation** to leave only the dock visible, and **Show conversation** to
restore the AI header, transcript, and host Voice region. These controls change
visibility only: they do not pause, stop, or end Voice. Ending Voice while the
conversation is hidden also closes the AI panel; ending it while the
conversation is visible returns to the text composer.
When the conversation is hidden, the zoom and fullscreen controls remain above
the compact dock at the right edge.

The microphone action stays directly in the dock. **Mute microphone** becomes
**Unmute microphone** and remains pressed while input is muted. Mute is
independent of the activity state: if the assistant is playing audio, the dock
continues to say **Speaking** while the pressed microphone action truthfully
shows that input is muted. When no output or Brunch work takes precedence, a
muted session can instead show **Muted**. For Live sessions, **Thinking** means
Brunch has a submitted or streaming response, while **Speaking** means audio is
currently playing. Neither state announces progress aloud or changes the
microphone setting. The microphone action remains visible but disabled while
Voice is connecting, paused, or interrupted by an error.
The latest microphone-mute choice is reapplied when a handoff settles.

**Stop AI response** appears next to the separate **End voice mode** action
only while Brunch has submitted or streaming work. Stop cancels that current
canonical Brunch response; it does not reverse changes that already completed.
During a Live session, Stop leaves both media sessions and the microphone
available for the next turn. **End voice mode** tears down Voice but does not
cancel canonical Brunch work already in progress, so select Stop first when
you also need to cancel that work.

Open **Audio options** for session-local speaker controls. Both Live and
Realtime Voice provide **Mute speaker** / **Unmute speaker** and **Speaker
volume**. These controls affect assistant playback only: they do not affect
microphone input, Brunch work, or the **Speaking** state. When the speaker is
muted during playback, the dock therefore continues to say **Speaking** and
Audio options shows the pressed speaker state. Speaker mute and volume reset
for each new Voice session. Speaker controls are unavailable while Voice is
connecting or interrupted by an error; they remain available while Realtime is
paused. They are the only Audio options preferences that reset per Voice
session: Realtime remembers **Interruption by speaking** in this browser. The
dock does not promise device switching, voice or speed selection, helmet
animation, or persistence of the speaker settings.

Realtime-based Brunch Voice additionally provides **Repeat question**, **Read
full response**, and **Interruption by speaking** in Audio options. Live Voice
does not show these controls. **Read full response** becomes available after
the matching response and speech have both finished and replays every exact
retained canonical segment in order. **Repeat question** uses the same
availability gates and replays only exact question text explicitly marked by
Brunch. It stays disabled when that marker is missing or does not match
finalized assistant text.
Both replay controls stay unavailable while capture, submission, cancellation,
pause, or an error makes playback unsafe.

With **Interruption by speaking** enabled, start speaking while Brunch is
talking to stop its audio and give your answer. Your interrupting words are
captured; you do not need to repeat them. If Brunch is still finishing its
previous turn, the dock shows **Answer captured. Waiting for Brunch.** and
sends that answer when it is ready. Wait for it to be sent before giving
another one. Disable **Interruption by speaking** to use manual handover. In
manual mode, select **Your turn**, wait for cancellation to finish, then speak;
audio before that handover is discarded. **Your turn** is hidden while
interruption by speaking is enabled.

Semantic voice detection finishes an answer automatically after a natural
pause, so there is no required done-speaking action. Duplicate, empty, failed,
or unavailable transcripts are not submitted. Provisional words remain
display-only until the provider finalizes their transcript. Spoken turns then
appear in the conversation, and finalized spoken user messages carry a
**Voice** chip. Only finalized answers and canonical Brunch text become chat
history; provisional transcription and provider audio are ephemeral.
Completed interruptions that strongly repeat the assistant's active speech may
be silently discarded instead of sent as an answer. Short answers such as
“stop” and “no” remain valid.

Voice failures and recovery warnings, including unconfirmed submissions and
input that was not retained, appear behind the Voice warning indicator instead
of as global notifications. Hover to preview or select it to read the complete
details, including while the conversation is hidden. Distinct issues share one
icon with a count. Dismissing them does not retry a request or mean unsent
input was retained. Temporary notices replace the short dock state only while
they apply. Diagnostic references and their records contain neither your
transcript nor the response being spoken.

Realtime Voice pauses microphone capture and active speech when the AI panel
closes. Reopen the panel and select **Resume voice mode** to continue. Live
Voice ends when the panel closes. If Realtime Voice is interrupted, allow
microphone access or check the connection, then select **Reconnect voice
mode**. **Clear AI chat** is unavailable while a Voice session is active.

When no interview is active and the host permits clearing, **Clear AI chat** via the delete button in the top right of the panel wipes the local conversation, stops any in-flight stream, and tells the host app to forget the messages if it persists them. Hosts with canonical history may disable this control. The Brunch panel disables it because clearing only the browser view would not delete Flue history and the conversation would return on rehydration.

## What the assistant can do

The assistant has tools for inspecting and modifying the current net. You'll see one card per tool call inline in the conversation. A failed tool card leads with its complete error instead of hiding it behind a hover tooltip:

- **Read tools** (neutral, expandable) –– for checking the current net state and active Petrinaut extensions at any point, for compilation errors, and for reading the user guide.
- **Applied mutation tools** (green for additions/updates, red for deletions) -- "Added place X", "Updated transition Y", "Removed metric Z", and so on. Multiple successive tools group under a collapsible "N operations" header; that count includes operations that made no change.
- **Not applied** (neutral, with a dash) -- a completed tool that explicitly reports no change shows its actual reason rather than a successful summary of the requested edit. This includes blocked, declined, unchanged, and host-refused mutations. Execution errors remain red and show the error.
- **`setNetTitle`** -- renames the net when the host supplies title editing.
- **`applyAutoLayout`** -- rearranges places and transitions on the canvas. If the assistant calls this on a net you've already arranged, it asks you first via an inline widget with **Yes, auto-layout** / **No, keep current layout** buttons. Otherwise it'll run it without asking.
- **Host-specific questions and actions** -- an application embedding Petrinaut
  may add interactive widgets. For example, an elicitation assistant can ask a
  structured question inline and continue after you submit the answer. The
  control stays visible as a read-only record of your submitted value. During
  elicitation, inline sweep cards may also list the facts captured so far,
  whether earlier facts were superseded or retracted, and any requirements that
  still prevent completion.

Clicking a mutation card usually selects the entity it touched (place, transition, scenario, metric, etc.) so you can inspect what changed.

An embedding application can check its live document immediately before and after a mutation, or refuse the change if the document no longer matches the request. A refusal leaves the document unchanged; an execution error remains attached to the matching tool call. These optional host checks do not change the stock assistant, read-only restrictions, or Stop behaviour. They do not cover title changes or auto-layout commands.

### Document titles

Title editing is a host capability. When the embedding application supplies `setTitle`, Petrinaut shows the editable title control. Without `setTitle`, the supplied title is read-only. The host also controls the assistant's tool manifest: `setNetTitle` is useful only alongside `setTitle` and should be omitted for a read-only title. If it is nevertheless called, Petrinaut reports that no change was applied because the host does not provide title editing.

For example, the Petrinaut website's worked-model route displays its template title as read-only and its Brunch tool manifest exposes no title mutation while still allowing permitted net edits. Ordinary local documents on that website supply title editing.

After applying changes, the assistant may automatically check TypeScript compile diagnostics (you'll see a **Checked net compilation errors** card) and fix problems on its own before continuing.

## Experiments from chat

When your host enables experiment tools, ask the assistant to run a saved
[scenario](scenarios.md) and measure one or more saved metrics.
For example: "Run 100 simulations of this scenario and show the completed
orders metric." The assistant can also search numeric scenario parameter
ranges to minimize or maximize a metric.

The experiment appears in a compact card with its status, run count, and
results. Simulation cards use blue; optimization cards use purple and glow
while running. Select **View
experiment** to inspect metric distributions in the Experiments drawer. The
heatmap shows how values spread across runs; click a time step to see its
histogram. Select **Cancel**
to stop its work. The assistant receives the
result when the requested work finishes; an optimization includes the final
runs at its best parameter values.

While an AI experiment runs, its compute-changing controls are locked. You
can inspect its charts or cancel it. After completion you can explore its
parameters again; the result already recorded in chat stays unchanged.
Experiments run in your current browser session, so keep the page open until
they finish. See [Experiments](experiments.md#experiments-created-by-the-assistant).

A request with no saved result and no active run shows **Not running**.
Ask the assistant to run a new experiment. **Cancel** is available only for
experiments running in this panel.

## Read-only behaviour

Whether the assistant can change the net depends on the editor state:

- **Application marks the document read-only (e.g. you don't have permissions)** -- no mutations at all.
- **Simulation running, paused, or completed** -- the same rule applies (reset the simulation to mutate the structure again).

The composer stays open in all of these cases, so you can still ask questions, request a review, or have the assistant read documentation -- it just won't be able to write changes back until you reset.

## Diagnostics integration

The assistant can request a fresh TypeScript check of the current net and
use the returned errors to revise its code. An unchanged set of errors still
counts as a completed check. If checking fails, the assistant receives an
error. Experiment creation also checks its selected
scenario and metrics before running. The bottom **Diagnostics** tab continues
to show diagnostics for the code you are editing.

## Host configuration

Whether the assistant is available, which additional composer controls or Voice modes appear, where the
conversation is stored (in-memory, in your host app's database, or anywhere else), and the model
behind it are all controlled by the host application that embeds Petrinaut. Read-only documents
and the simulate-mode restrictions described above always apply when applicable.
