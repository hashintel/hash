---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Report an AI mutation that leaves the document unchanged as not applied, without claiming the requested state was already present, so hosts can distinguish an applied document change from an unchanged one, and reliably continue consecutive browser tool calls from live or rehydrated assistant messages.
