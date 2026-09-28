---
"@hashintel/petrinaut": patch
---

Allow a host to claim and return issued browser tool results while its AI assistant response is still streaming, claiming each call when its turn in same-document order starts and cancelling the rest on Stop; stock hosts retain their existing tool path. `executePetrinautAiMutation` lets a host run one canonical AI edit with the assistant's own no-op detection and output.
