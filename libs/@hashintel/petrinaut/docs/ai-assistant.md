# AI Assistant

Petrinaut has an in-app AI assistant that can build a net from a natural-language description, review or revise an existing one, read TypeScript compilation diagnostics, run experiments, and consult its own user-guide pages to answer "how do I ..." questions. The host application controls whether the assistant and its tools are available -- it is enabled on [demo.petrinaut.org](https://demo.petrinaut.org) and in [HASH](https://hash.ai) and may or may not be enabled in other Petrinaut embeds.

## Opening the panel

Open the assistant in any of these ways:

1. **AI button** in the bottom toolbar (Edit mode only). Click it to open the panel; click again to close. The tooltip is "Show AI assistant" / "Hide AI assistant".
2. **File → New → Build with Brunch**. When the host enables its experimental Brunch demo mode, shows net-management controls, and provides an assistant, this creates a fresh empty net, opens the assistant, and offers two chips before the first message: **Interview first** (elicit before inventing missing detail or drawing the net) or **Quick preview** (fill reasonable gaps, mark them as provisional, and wait for assent). **Start blank** creates the same empty net without opening the assistant or showing the first-run prompt. Without that host flag, **New** retains its ordinary direct blank-net behavior.
3. **First-run prompt**. When you load Petrinaut against an empty net, a centred prompt appears. Type a description and its trailing action becomes **Send**; select it to open the panel with your message already in flight. When the host provides Voice mode, the empty prompt instead shows a waveform action titled **Start voice mode**. It opens the same assistant without creating an empty text message. Dismiss the prompt with the **X**, by clicking outside it, or by pressing **Escape**; it is hidden for the rest of the session once dismissed.
4. **Command palette**. Choose **Toggle AI assistant**, or press **Cmd/Ctrl+Shift+K** directly. This opens the assistant and focuses the message field, or closes it when already visible, including compact Voice mode. Reopening preserves the conversation and docked or floating layout. The command keeps you in your current view. This command is available when the host provides an AI assistant.

The assistant stays available across **Edit** (Canvas or Definitions), **Simulate**, and **Actual** modes. Switching views preserves your conversation, draft, and active response. The panel resizes by dragging its left edge. Text and voice share the primary transcript. Hosts can name that tab and add a second tab for related content. Select a tab to switch views, or use the left/right arrow keys while a tab is focused. Switching does not end a response, clear your draft or interrupt Voice; the composer and active controls remain available.

Some hosts mark activity that happened in the tab you are not viewing. A numbered badge counts unseen host-content updates; viewing that tab acknowledges them. A dot on the transcript tab means the conversation completed, errored, or was stopped while you were viewing the host tab; returning to the transcript acknowledges it. These acknowledgements are panel state, not durable conversation or document records, and reset when the mounted conversation is replaced.

### Docking and floating

The assistant opens in a sidebar at the far right of the editor. It sits flush against the viewport, beside the canvas and its properties panel. Its left divider and resize highlight span the full panel height. The sidebar slides in at its full width while the canvas makes room. Closing it returns that space to the canvas.

Experiment and Scenario panels make room for the docked assistant too. Their fullscreen presentation fills the main view beside it. Resizing or closing the assistant adjusts the available space; floating the assistant lets it sit above the open panel.

The bottom toolbar stays centered on the remaining main view, moving when needed to avoid overlapping its panels.

Choose **Float AI assistant** in the header to detach it into a rounded panel over the canvas. The canvas expands smoothly to reclaim the sidebar's space, and the floating panel reserves no space at the right edge. Drag anywhere in the header outside the tabs and action buttons to move it, or focus **Move AI assistant** and use the arrow keys. Hold **Shift** with an arrow key to move farther. The floating panel stays within the editor when the window changes size.

Choose **Dock AI assistant** to return it to the right sidebar. Switching between these layouts keeps your draft, conversation, and active response. Resize the sidebar from its left edge. When floating, drag the left or right edge to change its width, the top or bottom edge to change its height, or any corner to change both together. The opposite edge or corner stays fixed, and the panel stays inside the editor. Resizing only one dimension preserves the saved size of the other, even when the editor is too small to display it in full. Closing and reopening the assistant keeps your layout choice and floating height for the editor session.

Hovering a floating side highlights its straight border, fading out before each corner. Hovering a corner highlights its rounded border and fades along the two adjoining edges. Drag the corner to resize both dimensions.

The header text is not selectable. Header icons animate on hover and click unless reduced motion is enabled.

## The conversation

### Interview budget

In the website's Brunch assistant, the round icon beside Send opens an interview budget. The same control appears in the Voice dock. Choose **Off**, **Quick · ~5 min**, **Standard · ~10 min** (the default), **Thorough · ~20 min**, or **Deep · no limit**. Click a stop name, drag the rail, or focus it and use the arrow keys. The browser remembers the level.

While a budget is active, a quiet status sits at the right above the composer or Voice dock. It shows the chosen level until the first reply, then an estimate of time from questions left; it is not a countdown. The row keeps its space, so these changes do not move the input controls. Hover or focus it for a card with the question count and closing behaviour. Quick, Standard and Thorough allow respectively 3, 6 and 10 replies in text, or 2, 4 and 7 in Voice. A grouped question or a confirmation-only reply counts once. The estimate progresses to **Last question**, then **Wrapping up**. Deep shows the running count and offers pauses; Off hides the estimate and uses the ordinary interview without a budget.

Changing the level adds a note to this session's transcript. Earlier questions still count towards the new cap; Brunch applies the change on the next submission. At the cap, Brunch records the latest answer and closes with stated facts, labelled assumptions and open items. A cap does not mean the model is complete or runnable: missing facts, ranges and units remain open rather than being invented. You can choose a higher level to continue.

### Messages and activity

In the stock assistant, an empty conversation asks you to **Describe the process you want to create**; later turns say **Continue iterating...**. Press **Enter** or choose **Send message**. **Shift+Enter** adds a line. The field starts as a single line beside the action button and grows with your message. In Brunch Chat, the field always says **Continue iterating...**, and its button switches between Voice for an empty field, Send for typed text, and Stop while a response is running. **Waiting for your decision** marks an open approval; **Experiment running** marks an active run. Suggestion chips hide while Brunch is working and return when idle. Scrolling up keeps your reading position; new text follows automatically only when you are within 96 pixels of the bottom.

The primary tab reads **AI** unless the host names it. In Brunch it reads **Chat**, or **Voice** while Voice mode is selected. Your messages appear in right-aligned grey bubbles. Each Brunch turn groups its work in a neutral disclosure, followed by a light-blue answer and any produced cards. In Voice, the written Brunch answer is inside the work disclosure instead. The stock assistant keeps plain answers and a horizontally scrolling row of suggestion chips; Brunch's chips wrap to fit the panel.

Before Brunch starts a response, **Waiting for Brunch** and a small blue spinner
appear above the composer or Voice dock. This status uses reserved space, so
appearing or clearing it does not move the transcript or input controls.
Suggestion chips keep their space while hidden and cannot be activated during
work. Once the response arrives, its **Working…** header takes over; there is no
duplicate status or information button below it. The spinner stays still with
reduced motion enabled. While viewing Ledger, the reserved row reports
**Brunch is working** instead. The stock assistant shows its working label without this reserved Brunch status row.

Completed Chat answers offer **Copy** and **Retry**. The latest answer keeps these controls visible; older answers reveal them on hover or keyboard focus. Touch screens keep them visible. Copy keeps the answer's Markdown and briefly shows a check mark after copying succeeds. Retry sends that answer's original prompt as a new turn, keeping the previous answer and any unsent draft. It can lead to new tool calls, just like sending the prompt yourself. Retry is unavailable while another response or voice handoff is active.

Brunch opens activity and streaming thoughts when work starts. Activity, thoughts,
and tools keep your open/closed choices as more text arrives, tools finish, or the
response completes. Long activity scrolls inside a bounded area instead of
continually pushing the answer down. **Working…** stays until the response ends,
then becomes **Activity · Ns**; history without timing says **Activity**. Previously
completed turns start collapsed. A new **Approval required** request reveals its
controls and removes the height limit so the decision is not hidden. Expand
activity to inspect **Thought for Ns** and **Used N tools**. Other hosts retain
their collapsed reasoning default and automatic work/tool collapsing. Stopped
work says **Stopped after N tools** and retains a **Response stopped** note.
Unfinished tools show **Cancelled** while completed rows keep their results.
Timing is shown when supplied or observed during this session; unavailable tool
durations show a dash. Disclosure icons are neutral; status dots distinguish
pending, completed, and failed tools.

Before Brunch removes model elements, an approval lists the requested removals. Associated arcs or references may also be removed. **Allow** applies that removal; **Deny** withholds that call and tells Brunch nothing was changed. Brunch's later calls in the same response wait until you answer, then continue to run. **Always allow** permits later removals only in the current mounted conversation, until you leave or reload. It does not grant permission for another conversation or browser session. Stop cancels a pending approval. Auto-layout asks separately; see `applyAutoLayout` below.

When the host supplies them, Voice also shows a collapsed brief directly under your message, an immediate spoken-agent reply before the work, and a wrap-up after the produced cards. The brief says **Preparing for Brunch** while its fields are being prepared, **Sending to Brunch** once the fields are ready but not yet accepted, and **Sent to Brunch** after acceptance. Expand a prepared brief to see **Prepared from what you said** and its right-aligned fields. Missing excerpts display **Still open**; that placeholder is not sent as an extracted fact. If preparation fails, your original words are sent without prepared fields: the brief says **Sending without preparation**, then **Sent without preparation** after acceptance. These optional parts are absent in hosts that do not provide them. In Chat, a small neutral voice-bars icon marks user messages sent using Voice; typed messages have no icon. In Voice, those per-message icons are hidden.

Hosts that provide live input captions can show your words while you speak. This partial text is display-only: it does not submit work or start preparing a brief. The finalized transcript replaces it in the same bubble before preparation starts. New spoken words and status labels fade in; reduced-motion preferences disable these effects.

Brunch work, reasoning, and tools use compact inline disclosures. Expand **Thought for Ns** to read the reasoning heading and details; expand the tool group to inspect its indented rows. The stock assistant shows reasoning and tool calls directly, opens streaming reasoning by default, and uses its standard tool cards. Keyboard focus uses Petrinaut's blue outline.

While a response is streaming you can:

- Expand the work disclosure to watch reasoning and tool operations. The working label shimmers while active. Brunch Chat opens streaming reasoning; you can close it without interrupting the response.
- Expand **Used N tools** to inspect chronological tool rows, each with its name, duration and status dot: amber pending, green completed, or red error. Expand a row to read its arguments and result. **Preparing…** means streamed arguments are arriving; **Running…** means execution is pending. Interactive questions remain available for your answer.
- Press **Stop AI response** (the send button turns into a stop icon) to halt the current response. A host with durable conversation execution can record that stop before Petrinaut cancels its local stream; without that host capability, Stop is local cancellation only. Stop also withholds browser tools that have not started. Brunch's integrated assistant returns browser results within the active reply rather than requiring a second message; other hosts may still use an automatic follow-up. Already-applied changes are not rolled back. If a browser result is lost after a change may have happened, its outcome is unknown and the assistant does not automatically retry it. A silently disconnected browser is detected after a bounded liveness wait, not immediately.
- Type your next message in the composer -- it is queued for after the current response ends.

The assistant's compilation check runs against the current model, even when its diagnostics are unchanged from the previous check. If you edit the model during that check, the result asks for another check instead of claiming the new version compiles. Compilation checks do not establish simulation correctness.

The application embedding Petrinaut may place an additional control beside the message box. For example, a host can offer another way to enter finalized text. Text submitted by that control behaves like text sent with the keyboard: it joins the same conversation and, when an inline question is waiting for an answer, completes that question rather than starting an unrelated message. A host can explicitly submit a separate message instead when the text is a correction or other follow-up that must not answer the pending question.
If the host offers voice input, only a finalized transcript captured while Voice owns the input turn can be submitted. Voice waits while an existing response finishes or yields through the host's handoff control.

If an assistant request fails, Petrinaut shows the complete error in a persistent toast rather than adding it to the conversation. Long errors wrap, diagnostic details can be copied, and the toast stays open until you close it. Retry from the composer when the assistant is ready.

Hosts may provide canonical conversation rehydration. In that case, reopening the same assistant shows its settled and stopped turns without resubmitting a message or replaying Voice audio. Spoken user messages remain in the transcript and show the voice-bars icon in Chat when their voice origin is retained. Durably aborted assistant entries retain their **Stopped** label even after later completed replies. If a tool-call step had already completed when Stop withheld its browser follow-up, that local decision has no durable cancellation record: hosts using initial-history recovery can recover the tool as pending work. Do not treat that local withholding as a reload-safe cancellation.

A host may also enable live history following, as the local Brunch panel does. Turns submitted elsewhere then appear in the open conversation without a reload. Your own in-progress response stays in place until the host confirms that its canonical history has caught up. In this mode, tools observed from another participant or restored after reopening are display-only: watching a pending tool does not execute it or resume that turn. Tools emitted in response to your own local submission still execute normally. A pending externally submitted tool needs its originating participant/operator to resolve it; reopening this following panel is not automatic recovery.

### Ledger in Brunch

In Brunch construction conversations, the **Ledger** tab shows the saved account as a readable document while **Chat** contains the transcript. Ledger updates when Brunch saves a revision, without covering the canvas or opening another panel. Each unseen settled revision adds to Ledger's badge while Chat is selected or the panel is closed. You can read Ledger while continuing to type in the same composer, then switch to Chat to inspect the reply; if a response completes, errors, or is stopped while Ledger is visible, Chat receives an activity dot. Closing and reopening the assistant retains the selected tab for that mounted conversation.

Ledger presents the saved account without internal revision hashes, mutation ranges, or duplicate raw Markdown. A warning appears when a later Ledger revision exists than the one shown or the recorded explanation predates a newer revision. Ask Brunch to refresh the Ledger or explain the relevant model part again when you need a fresh answer. Brunch does not automatically detect direct edits after its latest model read; ask it to read the net again before relying on a current explanation.

### Prepared local demo fixture

The local Petrinaut development demo offers a labelled crew-reservation fixture when Brunch is
configured. Opening it restores a test-authored Markdown workpiece, a non-empty final-inspection
net, and their canonical Brunch conversation. The status panel distinguishes prepared text from
model-produced revisions and states the fixture's non-claims.

The document is mirrored to browser local storage automatically; there is no separate Save action.
Wait for the status panel to report a settled bundle before reopening the same fixture in another
tab. A refused status leaves the previous coherent bundle selected and names the failed history, workpiece, or document check instead of claiming that partial state settled.

When the Brunch voice preview is enabled and available, an empty composer shows a waveform action
titled **Start voice mode**. Typing non-whitespace text replaces it with **Send**. The same dynamic
action appears in the first-run prompt and the assistant panel; if voice is unavailable, the empty
composer retains a disabled **Send** action. Starting Voice mode keeps the transcript in place and
opens the existing one-time disclosure. Voice selected from the first-run prompt starts compact: the
disclosure and microphone check appear in a card immediately above a **Voice setup** dock, while the
AI header, transcript, and composer stay hidden. The card opens without shifting the dock or viewport
controls, and scrolls within the available screen height. It uses one bordered surface, with **Start voice**
and **Test microphone** together and **Cancel** on the right. Setup does not show **Connecting** before
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
history, and changes to the net. In the website's Live mode, your complete
finalized words go to Brunch alongside excerpts from a prepared brief, so short
replies, corrections and requests to use defaults are not lost during preparation.
If the brief cannot be prepared, your words are sent without excerpts.
Brunch uses the prior conversation to interpret them. Expand **Sent to Brunch**
to inspect the brief. **Still open** means a detail was not extracted from this
turn, not that a previous answer has been forgotten. Those placeholders are not
sent to Brunch. The brief is not editable before sending in this version.

Live is asked to acknowledge each request briefly, then summarize Brunch's
settled answer after its work and cards appear. Spoken replies are intended to
feel like one natural conversation, without internal handoff names or unsolicited
waiting updates. Live is asked to listen silently while you speak, then use one
short, meaningful sentence rather than filler such as “Hmm” or “Mm-hmm”. It does
not read the full written answer.
Acknowledgement timing and wording are best effort and can
overlap Brunch's work. Blue voice cards show Live's output transcript, not a
copy of Brunch's written answer or confirmation that you heard the audio.
Captions update during the session. The acknowledgement and wrap-up are grouped
at sentence boundaries rather than cutting a sentence between cards. A completed
acknowledgement stays above the activity when the next sentence starts at the
handoff, even if the transcript omits the separating space. An unfinished sentence
can move to the wrap-up as later text arrives; this grouping is approximate,
not a record of when the audio played. Repeated spoken words stay in the captions.
Grouping closes on the next turn or when the session ends. Speaking again
suppresses pending older summaries but does not cancel work already admitted by Brunch.

Your finalized words, extracted brief and Brunch's answer are saved in the
conversation. Spoken captions and the original-word display are also retained
as local annotations in this browser for the most recent 100 voice turns; those
annotations are not synchronized to another device. Clearing browser storage
removes the annotations without deleting the words saved in Brunch's history.
Reopening never replays speech. Realtime-based Voice retains its existing
transcript-and-readback behaviour.

Before the first Live session, the permission
panel explains both OpenAI audio streams and text retention, with a permission
checkbox, **Start voice**, and **Cancel**. Petrinaut remembers this
Live-specific versioned acknowledgement in browser storage, so later Live
sessions start directly. **Test microphone** checks access to the selected microphone locally
and immediately releases it; it does not start a provider session or send audio.
A failed or ended acknowledged session offers
**Retry voice** without showing the consent prompt again. Browser microphone
permission remains separate. The compact recovery card offers **Back to chat**
and keeps the full connection diagnostic under **Technical details**. While the
previous session is stopping, Retry remains disabled.
In the consent panel, **Cancel** returns to text without starting a session. If the browser blocks remote
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
visibility only: they do not pause, stop, or end Voice. A floating panel also minimizes to the
bottom-right dock; expanding restores its previous position and size. Ending Voice while the
conversation is hidden also closes the AI panel; ending it while the
conversation is visible returns to the text composer.
When space is tight, the dock keeps the waveform and action buttons usable and
truncates only the visible status with an ellipsis. Screen readers still
announce the complete, untruncated status.
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
An interrupted connection shows a slowly moving red waveform, not microphone
activity. The waveform stays still when reduced motion is enabled.
The latest microphone-mute choice is reapplied when a handoff settles.

The right-hand controls appear in this order: **Stop AI response**, **Audio
options**, **Mute microphone**, and **End voice mode** (the hang-up handset).
The **Devices** row in Audio options shows the selected microphone and speaker
even when collapsed. **Stop AI response** appears only while Brunch has
submitted or streaming work. Stop cancels that current
canonical Brunch response; it does not reverse changes that already completed.
During a Live session, Stop leaves both media sessions and the microphone
available for the next turn. **End voice mode** tears down Voice but does not
cancel canonical Brunch work already in progress, so select Stop first when
you also need to cancel that work.

If you stop a written answer mid-response, Live receives quiet context identifying
the request and the available partial answer, rather than treating it as a failed
or unaccepted request. Say **Continue** to request the rest of that answer through
Brunch. This starts a new turn in the same conversation; it does not automatically
resubmit the stopped turn or replay its tools or speech. Live is instructed not to
read the partial answer aloud or finish it itself. Delivery and interpretation of
this context are best effort; an interrupted answer is not proof that unfinished
backend work was cancelled.

Open **Audio options** for session-local speaker controls. Both Live and
Realtime Voice provide **Mute speaker** / **Unmute speaker** and **Volume**.
These controls affect assistant playback only: they do not affect
microphone input, Brunch work, or the **Speaking** state. When the speaker is
muted during playback, the dock therefore continues to say **Speaking** and
Audio options shows the pressed speaker state. Speaker mute and volume reset
for each new Voice session. Speaker controls are unavailable while Voice is
connecting or interrupted by an error; they remain available while Realtime is
paused. Changing volume does not unmute the speaker, and unmuting restores its
retained volume. Realtime remembers **Allow interruptions** in this browser;
change it with the switch beside the hand icon.

When the host provides extended audio settings, Audio options also contains
**Voice** when supported. **Devices** starts collapsed; expand it to choose a
microphone or speaker. Providers with numeric speed control also show a
visible **Speed** slider immediately below **Devices**. The panel fits
its content and scrolls when it exceeds the available screen height. Opening
Audio options refreshes the device list. Voice warnings appear after Audio
options in the dock.

- **Voice** saves a preference in this browser for the selected provider and
  applies it to the next Voice session, without restarting the current session.
  Select the information icon beside **Voice** for guidance on when the voice
  changes and how to preview it. Preview and save errors remain below the selector.
  You can select a voice at any time, including before connecting. In Brunch,
  selection also previews a short sample when the session is connected, your
  microphone is muted, and the agent is idle. Otherwise, it saves silently for
  the next connection; it does not queue a preview. **Loading…** and then
  a small equalizer appear at the right of the field; there are no playback buttons.
  Selecting another voice replaces the sample; closing Audio options stops it.
  Samples follow output mute, volume, and speaker selection. Unmuting your mic,
  the agent becoming busy, or disconnecting stops the preview. Samples do not
  change the current session's voice or send microphone audio.
  Preview audio loads on demand and can be reused from the browser cache. A
  failed preview does not discard the saved preference.
  If browser storage is blocked, the selection lasts only until the page closes.
- **Show status text** is on by default. Turn it off to hide ordinary Listening,
  Thinking, and Speaking labels beside the voice indicator. The waveform, controls,
  microphone mute and connection notices, and screen-reader announcements remain.
- **Speed** stays visible when the provider supports it. Its compact horizontal slider follows
  the volume control's layout, with the multiplier at the right. It changes the
  next response, not speech already playing.
  Realtime offers 0.25×–1.5× in 0.05 steps and resets to 1× for a new session. Live does not
  offer numeric speed control.
- **Microphone** and **Speaker** choose devices for the current session. They
  start at **System default**. If a selected device disconnects, Voice attempts
  to switch that input or output to the system default without changing mute or
  volume. Reconnecting the old device does not automatically select it again.
- Device selection depends on browser support and permission. If speaker
  selection is unsupported, use your system's output settings. **Choose output…**
  requests permission where supported. After granting microphone
  access or connecting a missing device, reopen Audio options to refresh the list.
  If recovery fails, check the message in Audio options or continue in text.

Volume affects app output, not microphone gain. These settings do not add a
separate transcription view.

Realtime-based Brunch Voice additionally provides **Repeat question**, **Read
full reply**, and **Allow interruptions** in Audio options. Live Voice
does not show these controls. **Read full reply** becomes available after
the matching response and speech have both finished and replays every exact
retained canonical segment in order. **Repeat question** uses the same
availability gates and replays only exact question text explicitly marked by
Brunch. It stays disabled when that marker is missing or does not match
finalized assistant text.
Both replay controls stay unavailable while capture, submission, cancellation,
pause, or an error makes playback unsafe.

With **Allow interruptions** enabled, start speaking while Brunch is
talking to stop its audio and give your answer. Your interrupting words are
captured; you do not need to repeat them. If Brunch is still finishing its
previous turn, the dock shows **Answer captured. Waiting for Brunch.** and
sends that answer when it is ready. Wait for it to be sent before giving
another one. Disable **Allow interruptions** to use manual handover. In
manual mode, select **Your turn**, wait for cancellation to finish, then speak;
audio before that handover is discarded. **Your turn** is hidden while
interruption by speaking is enabled.

Semantic voice detection finishes an answer automatically after a natural
pause, so there is no required done-speaking action. Duplicate, empty, failed,
or unavailable transcripts are not submitted. Provisional words remain
display-only until the provider finalizes their transcript. Finalized spoken turns
appear in the same conversation. Chat marks them with the small voice-bars icon described above; Voice mode hides that per-message icon.
Only finalized answers and canonical Brunch text become chat
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

The delete button appears in the top right once the conversation contains messages. When Voice is inactive, **Clear AI chat** in ordinary Brunch starts a fresh conversation and resets conversation-only approvals. It preserves the model and the old saved history; it is not a history-deletion action. Reopening the page returns to the new conversation. Other hosts can clear local messages or disable this control.

An interrupted Voice session shows a gentle red waveform without a visible status label. Recovery controls remain available and screen readers still announce the interruption. Open **Voice issues** for a short title and explanation. **Copy details** becomes **Copied** after success; **Dismiss** clears the displayed issues without ending Voice.

## What the assistant can do

The assistant has tools for inspecting and modifying the current net. Expand the work disclosure and its tool group to see one row per call. A failed tool row exposes its error in the expanded result rather than only in a hover tooltip:

- **Pending tools** (amber dot) -- distinguish unfinished work from completed results.
- **Read tools** (neutral, expandable) –– for checking the current net state and active Petrinaut extensions at any point, for compilation errors, and for reading the user guide.
- **Applied mutation tools** (completed status dot) -- "Added place X", "Updated transition Y", "Removed metric Z", and so on. Successive tools remain visible as individual chronological rows. The status colour reports completion or failure, not whether a mutation added, updated, or deleted an entity.
- **Not applied** (neutral summary) -- a completed tool that explicitly reports no change shows its actual reason rather than a successful summary of the requested edit. This includes blocked, declined, unchanged, and host-refused mutations. A completed status dot indicates execution finished, not that a mutation was applied. A host can instead show a compact correctable refusal whose detailed reason stays collapsed. Execution errors show a red dot and the error.
- **`setNetTitle`** -- renames the net when the host supplies title editing.
- **`applyAutoLayout`** -- rearranges places and transitions on the canvas. If the assistant calls this on a net you've already arranged, it asks you first via an inline widget. Brunch uses **Allow** / **Deny**; the stock assistant uses **Yes, auto-layout** / **No, keep current layout**. Otherwise it'll run it without asking.
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

The experiment appears in a blue simulation card or a purple optimization card,
with its status, run count, progress and results. Select **View
experiment** to inspect metric distributions in the Experiments panel. The
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

### Brunch-drafted experiments

On the Petrinaut website, Brunch can propose an experiment when your modelling
conversation establishes a decision, objective, parameter range, operating
regime and horizon. The card says **Drafted — not run · not saved with the
document**. Review its settings, declarations and unsupported restrictions,
then choose **Run** or **Dismiss**. Brunch can continue the conversation while
the card waits; drafting never starts execution.

An unsupported hard restriction disables **Run**. A metric labelled
**reported, not enforced** only measures a condition; it does not enforce it.
If you explicitly accept a reporting-only exploration, ask Brunch for a revised
proposal. When the model changes after drafting, the card shows the changed
model sections for review and requires confirmation before running.

A later proposal replaces the earlier draft in that editor. Drafts are not
saved with the document and must be drafted again after a reload or reopening
the editor. A prepared draft stays in chat without a **Simulate** badge or
active indicator. Choosing **Run** starts execution and uses the normal
**1 active** indicator; when it completes, that indicator
disappears and the result remains under **Simulate → Experiments**.

**Dismiss** retains the proposal as a **Dismissed** record. After **Run**, the
draft is replaced in place by the same blue simulation or purple optimization
card used by the built-in assistant: **Validating**, steps and runs, then
**Finished** with metrics. **Cancel**
leaves a **Cancelled** record. A failed run offers **Retry run**; model changes
still require review before retrying. Drafting and starting a run keep your
current tab selected; choose **View experiment** to open its results while the
experiment is still available.

Completed local results are sent to Brunch as a new message in the originating
conversation when it is ready, without clearing your unsent draft. Brunch can
then interpret them in a new answer. A stopped response is not automatically
resumed. If submitting the result fails, choose **Retry result summary**.
The local run is not retained after reloading the session; the submitted result
message follows the host's conversation-history policy.

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

A host may place its assistant provider and Voice availability controls under
**User settings → Labs**. Petrinaut displays that host-provided content after
its built-in Labs groups; the host defines and saves those choices.
