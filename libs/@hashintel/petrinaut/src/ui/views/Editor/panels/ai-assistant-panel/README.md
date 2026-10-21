---
layer: ui.views.editor.ai
role: Renders AI conversations and executes client tools against the editor host
---

Deprecated: this is the built-in chat behind the `aiAssistant` prop. A plugin
that declares `assistant` renders its own chat in the assistant panel.

The assistant renders AI SDK messages and dispatches client tools from the
parent `ai-assistant-panel.tsx`. Document tools call the core instance.
Experiment tools call the browser host and show progress until its final result.
The embedding application supplies transport and conversation persistence.

See <a href="/architecture/react/experiment-host/ai-created-experiments">the browser host</a>
for execution and cancellation, and
<a href="/architecture/ui/views/editor/ai/experiment-chat">the chat integration</a>
for tool dispatch and presentation.
