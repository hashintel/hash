# Experiment Live Full Brunch Integration

The child branch's sole execution authority is the
[Brunch mission](../../libs/@hashintel/brunch-agent/MISSION.md).
This file is a pointer, not a second mission.

The accepted experiment uses native Live with best-effort speech instructions and
separate authoritative transcription. Brunch retains canonical answers and tool
authority; settlement gates Brunch context sent to Live, not all audible speech.
Independent questions and unsupported claims are manual-test failures.

Experiment 1's original standalone comparison remains at
[771712c1afe2d4f3d3e5ee8fac39d17303bee7a1](https://github.com/hashintel/hash/commit/771712c1afe2d4f3d3e5ee8fac39d17303bee7a1).
The child's restacked parent is
[b72c2ac9f83875d34f585bc672ef62496144fe6a](https://github.com/hashintel/hash/commit/b72c2ac9f83875d34f585bc672ef62496144fe6a).
This child does not close or modify that experiment. Its existing product code
still runs standalone Live until the integration is implemented and verified.

Keep `PETRINAUT_VOICE_PROVIDER=realtime|live`, with unset meaning `realtime`.
No paid sessions, automatic microphone access, product commits, pushes, published
PRs or deployment are authorized. Kostandin performs live testing manually.
