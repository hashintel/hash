---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Actual mode no longer assumes where its execution comes from. `ActualModeSource` is `{ id, label? }`, an opaque id and an optional label the host chooses. `ActualModeContextValue` drops `receivedEvents`, and core drops `ActualModeReceivedEvent`, `ActualModeReceivedEventsRecording` and `createActualModeReceivedEventsRecording`. `ACTUAL_MODE_RECORDING_VERSION` is now 2, and `parseActualModeRecording` rejects version 1 recordings. The Events tab's **Export Recording** downloads Petrinaut's recording, and plugins can add their own items to its Export menu with the new `actualExports` contribution.
