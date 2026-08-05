---
layer: react.lsp
name: LSP provider
role: Exposes the core language client to the editor as React context
boundaries:
  - kind: thread
    note: Every completion, hover and diagnostic is an async round trip to the language-server worker
---

# LSP provider

Wraps the core's language client in a context so Monaco-backed editors can
request completions, hovers, signature help and diagnostics.

Everything here is asynchronous by necessity — the language server runs on its
own thread — so the provider models request state rather than returning answers
directly. Components render the pending state instead of blocking, which is what
keeps typing responsive while the server catches up.
