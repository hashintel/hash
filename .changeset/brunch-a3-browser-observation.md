---
"@hashintel/petrinaut": patch
---

Hosts can also provide an additional assistant tab for content such as a saved workpiece, reusing the panel's sizing and keeping the conversation, composer and Voice controls mounted across tab switches. Add an optional synchronous `aiAssistant.executeMutation` boundary so embedding applications can inspect their live document around a canonical mutation or refuse execution, while the panel retains control of tool results and continuation. Show explicitly unapplied assistant operations with their reason instead of a successful mutation summary, and label grouped tool calls as operations rather than changes. Hosts can opt into following canonical AI conversation history once local submissions are settled, while preserving local streaming output; externally observed and reloaded tools are display-only in that mode, and locally streamed tools retain normal execution.

Host automatic tools now receive the same capabilities the built-in assistant tools execute against — `commands` alongside `mutations` and the handle, plus `readDiagnosticsContext()` for the editor's current TypeScript diagnostics — and the panel arms pending diagnostics only when a host tool actually changed the document. `petrinautDocsContent` is exported from `/ui` so a host tool can serve the same user-guide pages.
