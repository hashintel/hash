# Brunch provider admission

Brunch's admission layer around a pi-ai model provider. Unpublished.

`withBufferedToolAdmission` wraps a provider so that, while admission is active, a response is buffered until its whole tool proposal is admitted; a mixed browser/server proposal outside the allowlist is refused. Optional idle recovery bounds the first event, reasoning start and idle gaps of the stream. `modelAdmissionScope` carries a per-execution retry scope, and `claimModelStreamIdleRetry` grants its single idle retry. The Brunch server registers its providers through it; the Petrinaut website's integration tests wrap their fixtures the same way.
