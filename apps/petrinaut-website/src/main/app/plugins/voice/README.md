# Voice plugin

`plugin.tsx` holds the manifest, with the Voice and Realtime flags and the
`BrunchConversation` token it requires, and binds `plugin/use-voice-plugin.tsx`
to it. That body extends Brunch's assistant while Brunch is the shown
assistant: it checks the deployment's voice capability, keeps the mediation
history per conversation, and returns the voice controls and the caption
projection that Petrinaut merges into Brunch's chat.
`brunch-voice-mode.tsx` binds the interview control to one conversation.

| Folder      | Holds                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| `session/`  | The interview control and its disclosure, session state, turn control, audio  |
| `live/`     | The Live transcription path: conversation, bridge, captions, canonical speech |
| `realtime/` | The OpenAI Realtime path: session and bridge                                  |
| `history/`  | What was said live, per conversation, for captions and continuity             |
| `shared/`   | Helpers both paths use                                                        |
