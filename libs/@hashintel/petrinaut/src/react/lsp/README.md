---
layer: react.lsp
role: Exposes the core language client to the editor as React context
---

The language client block creates Core's language client for the open
document and publishes it as a context. It checks nothing itself: the
[language worker](layer:core.lsp.worker) checks, and
[Monaco](doc:ui.monaco/monaco) draws the result in the code editor.

## Interface

| File                 | What a caller takes from it                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `provider.tsx`       | `LanguageClientProvider`, the first provider `PetrinautRuntimeProvider` mounts. It takes an optional worker factory.   |
| `context.ts`         | `LanguageClientContext`: the diagnostics the worker last pushed, the net analysis, the requests and the session calls. |
| `use-lsp-session.ts` | `useLspSession`, which keeps a temporary session of the worker for the life of a component.                            |

## Protocol

**The net that is checked.** The provider sends the worker the executable
net: the document with the components of its imports inlined, which
`useExecutableDefinition` of [the document block](layer:react.document)
gives. A port of an imported component is a place only once the component is
inlined, so code that reads it type-checks against that net alone. The
simulator and the compiler take the same net. The first net goes out as
`initialize` and each later one as `sdcpn/didChange`.

**The life of the client.** The provider creates the client in an effect and
disposes it in the cleanup, so each mount owns one worker, under React's
StrictMode too. Until the client exists the context holds its default, whose
requests answer without a worker: with an empty result, or with an error that
says no client is wired. `PetrinautProvider` keys the providers
above this one by the id of the document's handle, so a switch of net starts
a new client.

**The life of a temporary session.** A session checks code that is in no
document yet, such as a metric in a drawer. `useLspSession` takes the three
calls of one kind of session, the content and a content key:

| When                       | The hook calls                                                                  |
| -------------------------- | ------------------------------------------------------------------------------- |
| The component mounts       | `initialize`, with the content and a session id it generates, or the one given. |
| The content key changes    | `update`, with the latest content.                                              |
| A given session id changes | `kill` for the old id, then `initialize` for the new one.                       |
| The component unmounts     | `kill`.                                                                         |

The content is sent when the key changes and at no other time. A caller that
builds an equal content object on every render would otherwise update the
worker on every render, and each publish of the worker's diagnostics renders
that caller again.

[Language worker protocol](doc:core.lsp.worker/protocol) states the messages
behind these calls.

## Rules

- **A component that opens a session ends it.** The worker keeps a session,
  and publishes its diagnostics, until it is killed. `useLspSession` ties the
  three calls to the mount, so a caller uses it and does not call
  `initialize` itself.
- **The content key names everything the session holds.** A part of the
  content that the key leaves out reaches the worker only with the next
  change of the key.

No test of the block holds these. The scenario form, the metric drawer and
the constraints of an experiment are the callers.
