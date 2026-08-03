---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Make optimization runs detached and resumable — and make that the only contract. Optimization events carry a server-issued `seq`; the host optimization capability is now `createOptimizationRun`/`attachOptimizationRun`/`cancelOptimizationRun` (all required; attachments accept an `onAttached` callback so UIs can report an honest connection state), and the legacy single-connection `optimize` method is removed. The optimizations UI auto-reconnects dropped event streams by run id and cursor, re-attaching after page reloads where storage allows.
