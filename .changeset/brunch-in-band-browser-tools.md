---
"@hashintel/petrinaut": patch
---

Allow a host to run named AI tool calls and return their results itself while the assistant response is still streaming, through `aiAssistant.inBandBrowserTools: { has(toolName), run(call, execute) }`: Petrinaut calls `run` when the call's turn in same-document order starts, with a `signal` that aborts on Stop, and the host calls `execute(input)` at most once and reports the resolved output or the failure; stock hosts retain their existing tool path. `executePetrinautAiMutation` lets a host run one canonical AI edit with the assistant's own no-op detection and output.
