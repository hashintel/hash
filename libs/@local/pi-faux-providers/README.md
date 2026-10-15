# pi-ai faux providers

Test doubles for `@earendil-works/pi-ai` model providers, for any host built on Pi (Flue included). Unpublished and test-only.

- `@local/pi-faux-providers/install-faux-provider`: `installFauxProvider` replaces the `@earendil-works/pi-ai/providers/<id>` factory with a Node module hook, so the host's own provider registration runs unchanged around the substitute.
- `@local/pi-faux-providers/native-openai-provider`: `nativeOpenaiProvider` keeps the native OpenAI request serialization and SSE parsing and substitutes synthetic HTTP responses; `createNativeOpenaiToolStall` scripts a tool call that stalls until cancelled.
