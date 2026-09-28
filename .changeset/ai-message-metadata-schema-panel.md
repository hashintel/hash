---
"@hashintel/petrinaut": patch
---

The AI assistant panel validates streamed message metadata against Petrinaut's metadata schema, so a transport that sends malformed metadata fails the turn with an error instead of rendering it.
