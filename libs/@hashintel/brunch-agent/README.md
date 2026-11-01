# `@hashintel/brunch-agent`

What the Brunch agent app (`apps/brunch-agent`) and the Petrinaut website (`apps/petrinaut-website`) must agree on: Brunch's named constants, conversation identity, the browser-tool envelope, the browser-call protocol and the tools the browser executes, message metadata, the Petrinaut tool contracts, net element identity, contextual user messages with their submission context, the interview allowance and custom-word spellings, and the Ledger with its projection. It is browser-safe; it never imports the Flue runtime. Besides its main entry, two leaf entries, `@hashintel/brunch-agent/interview-budget` and `@hashintel/brunch-agent/words`, export the interview allowance and the custom-word spelling bounds alone, for the website code its Voice server functions share, whose `nodenext` type check cannot read the main entry's source.

Code belongs here when the server and the browser must agree on it: a contract between them, a derivation from conversation history that both compute, or how an element's ID is recognised. It belongs here even when only one side calls it today. Code only one side runs, with nothing to agree on, belongs in that app. Types derive from their owner here rather than being restated in either app.

The agents themselves, their guidance, Flue tools and evaluations live in [`apps/brunch-agent`](../../../apps/brunch-agent/README.md). The Petrinaut agent's architecture, including the Ledger and the browser boundary, is in [`apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md`](../../../apps/brunch-agent/docs/petrinaut/ARCHITECTURE.md).

```sh
yarn workspace @hashintel/brunch-agent test:unit
```
