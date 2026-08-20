# `@hashintel/petrinaut-cli`

Internal JSON-lines CLI for running one Petrinaut model repeatedly from
scripts, Python optimization loops, or backend jobs. `petrinaut serve` loads
and compiles one model (or one optimization manifest) per long-lived process,
then answers one request per line over stdio or a Unix socket.

The full reference — transports, the protocol, run requests, and optimization
studies — lives in the architecture docs'
[usage manual](../../@local/petrinaut-arch-docs/content/cli/usage-manual.mdx)
(browse it rendered with `turbo run dev --filter @apps/petrinaut-docs`).

Build the CLI, then serve a model saved from the editor:

```bash
turbo --filter @hashintel/petrinaut-cli build
node libs/@hashintel/petrinaut-cli/dist/cli.js serve --model ./my-model.json
```
