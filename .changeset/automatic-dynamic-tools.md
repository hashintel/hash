---
"@hashintel/petrinaut": patch
---

Allow hosts to register validated dynamic AI tools that execute automatically against the mounted editor. `ErrorTrackerContext.captureException` now accepts an optional `{ source, tags }` context, and the AI assistant panel reports its operational failures (stream errors, tool execution, continuation, Stop) to the host's tracker at their source.
