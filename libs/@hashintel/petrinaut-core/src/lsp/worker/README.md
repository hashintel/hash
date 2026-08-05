---
layer: core.lsp.worker
name: LSP worker
role: Hosts the TypeScript language server off the main thread
seams:
  - "@hashintel/petrinaut-core/workers/lsp"
boundaries:
  - kind: worker
    note: The language server runs in its own thread; the client reaches it only over the documented protocol
---

# LSP worker

The language server that backs editing user code inside a net, and the protocol
the client speaks to it.

- `language-server.worker.ts` — the worker entry point.
- `create-language-server-worker.ts` — constructs it and wires the port.
- `protocol.ts` — the request and notification shapes crossing the boundary.

Running the server on its own thread is load-bearing rather than incidental:
typechecking a net's user code is unbounded work, and on the main thread it would
compete with the render loop for exactly the frames a user is editing.
