# Voice

Voice mode on the Brunch assistant. The demo shell renders the interview
control into the AI panel while Brunch is selected and Voice is enabled.

| Folder      | Holds                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| `session/`  | The interview control and its disclosure, session state, turn control, audio  |
| `live/`     | The Live transcription path: conversation, bridge, captions, canonical speech |
| `realtime/` | The OpenAI Realtime path: session and bridge                                  |
| `history/`  | What was said live, per conversation, for captions and continuity             |
| `shared/`   | Helpers both paths use                                                        |
