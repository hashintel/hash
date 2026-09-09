---
"@hashintel/petrinaut": patch
---

Add an optional synchronous `aiAssistant.executeMutation` boundary so embedding applications can inspect their live document around a canonical mutation or refuse execution, while the panel retains control of tool results and continuation. Show explicitly unapplied assistant operations with their reason instead of a successful mutation summary, and label grouped tool calls as operations rather than changes.
