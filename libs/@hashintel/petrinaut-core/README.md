# Petrinaut Core

Headless Petrinaut APIs for SDCPN documents, mutations, simulation, playback,
language services, and supporting domain utilities.

This package intentionally has no React or UI dependencies. The visual editor
package, `@hashintel/petrinaut`, builds on top of it.

## Handle Creation

Petrinaut reads and writes documents through `PetrinautDocHandle`. Use
`createJsonDocHandle()` for an in-memory handle with patch events,
extension sanitization, and optional undo/redo history:

```ts
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

const handle = createJsonDocHandle({
  id: "my-net",
  initial: {
    places: [{ id: "p1", name: "P1", x: 0, y: 0 }],
    transitions: [],
  },
});
```

`initial` accepts `SDCPNInput`, a loose document shape for host integrations.
Plain-net defaults are filled in automatically: omitted arc weights become `1`,
input arc types become `"standard"`, extension arrays default to `[]`, and
disabled extension data is sanitized according to handle capabilities.

When another application is the source of truth, implement `PetrinautDocHandle`
directly so editor edits can emit `source: "local"` and host/store updates can
emit `source: "remote"`. The visual editor package has a fuller guide in
`@hashintel/petrinaut/INTEGRATION.md`.
