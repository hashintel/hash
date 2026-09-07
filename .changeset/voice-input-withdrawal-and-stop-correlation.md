---
"@hashintel/petrinaut": patch
---

Let hosts withdraw a retained voice input through an `AbortSignal`, keep a late durable Stop result from cancelling a newer turn, replace all conversation-owned assistant state when the conversation identity changes, hydrate host-owned history only once it carries every locally streamed reply, keep the composer status busy across the automatic follow-up to a client-tool step, and let a Stop pressed during that step withhold the follow-up.
