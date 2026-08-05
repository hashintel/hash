---
layer: ui.monaco
name: Monaco integration
role: Wires the Monaco editor to the language server for authoring user code
boundaries:
  - kind: thread
    note: Each sync component bridges a Monaco provider to an async worker request
---

# Monaco integration

The bridge between Monaco's synchronous provider API and the asynchronous
language server.

Each `*-sync.tsx` file adapts one Monaco capability — completions, hovers,
signature help, diagnostics — into a request to the LSP provider. They are
separate files because Monaco registers each capability independently, and
because a failure in one (hover, say) should not take out the others.

`editor-paths.ts` maps a net's code surfaces onto virtual file paths, which is
what lets one language server serve every lambda, kernel and metric in a net.
