---
"@hashintel/petrinaut": patch
---

The AI assistant puts a message back in the composer only when the host transport refuses it. Once the transport has returned a response stream, a later failure of that stream no longer offers the same message for sending again.
