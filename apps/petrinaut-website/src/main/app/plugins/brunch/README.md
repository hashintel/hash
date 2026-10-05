# Brunch

The demo shell builds the Brunch chat configuration for the open document from
the files here.

| Folder          | Holds                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| `conversation/` | Conversation identity per document incarnation, the principal, Flue history, the binding   |
| `tools/`        | Canonical host tools, in-band browser calls, mutation approvals, the draft-experiment tool |
| `ledger/`       | The Ledger tab: the workpiece history and its pane                                         |

`brunch-preview-config.ts` resolves the endpoint from the environment for the
demo shell. The conversation tracker and the panel transport live in
`../_shared/brunch-panel-transport.ts`, because Voice follows the
conversation through them.
