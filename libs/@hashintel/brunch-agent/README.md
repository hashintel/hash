# `@hashintel/brunch-agent`

What the Brunch agent app (`apps/brunch-agent`) and the Petrinaut website (`apps/petrinaut-website`) share: Brunch's named constants, conversation identity, the browser-tool envelope and message metadata, the Petrinaut tool contracts, and the Ledger with its projection. It has one entry and is browser-safe; it never imports the Flue runtime. Code that only one app needs belongs in that app.

The agents themselves, their guidance, Flue tools and evaluations live in [`apps/brunch-agent`](../../../apps/brunch-agent/README.md). The Petrinaut agent's architecture, including the Ledger and the browser boundary, is in [`apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md`](../../../apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md).

```sh
yarn workspace @hashintel/brunch-agent test:unit
```
