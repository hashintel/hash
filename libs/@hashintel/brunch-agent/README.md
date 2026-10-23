# `@hashintel/brunch-agent`

What the Brunch agent app (`apps/brunch-agent`) and the Petrinaut website (`apps/petrinaut-website`) share: Brunch's named constants, conversation identity, the browser-tool envelope and message metadata, the Petrinaut tool contracts, contextual user messages with their submission context, the interview allowance and custom-word spellings, and the Ledger with its projection. It is browser-safe; it never imports the Flue runtime. Code that only one app needs belongs in that app. Besides its main entry, two leaf entries, `@hashintel/brunch-agent/interview-budget` and `@hashintel/brunch-agent/words`, export the interview allowance and the custom-word spelling bounds alone, for the website code its Voice server functions share, whose `nodenext` type check cannot read the main entry's source.

The agents themselves, their guidance, Flue tools and evaluations live in [`apps/brunch-agent`](../../../apps/brunch-agent/README.md). The Petrinaut agent's architecture, including the Ledger and the browser boundary, is in [`apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md`](../../../apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md).

```sh
yarn workspace @hashintel/brunch-agent test:unit
```
