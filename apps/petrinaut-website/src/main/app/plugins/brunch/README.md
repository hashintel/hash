# Brunch plugin

`plugin.tsx` holds the manifest and binds `plugin/use-brunch-plugin.tsx` to
it. That body runs the Brunch integration for the open document as a hook and
returns the chat configuration Petrinaut's chat kit renders, the Ledger tab,
and the conversation other plugins read through the `BrunchConversation`
token in `../_shared/`. It reads the chat endpoint and the host's document
record from `BrunchHostContext`, declared in `brunch-host.ts`.

| Folder          | Holds                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| `plugin/`       | The body and its helpers: one instance per key, the immutable replay baseline              |
| `conversation/` | Conversation identity per document incarnation, the principal, Flue history, the binding   |
| `tools/`        | Canonical host tools, in-band browser calls, mutation approvals, the draft-experiment tool |
| `ledger/`       | The Ledger tab: the workpiece history and its pane                                         |

`brunch-preview-config.ts` resolves the endpoint from the environment for the
demo shell. The conversation tracker and the panel transport live in
`../_shared/brunch-panel-transport.ts`, because Voice follows the
conversation through them.
