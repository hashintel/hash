---
layer: cli.commands
role: Transport lifecycles — the stdio and Unix-socket serving loops around the protocol handler.
---

Each command owns one transport's lifecycle: bootstrap, the serving loop, and
shutdown. Bootstrap loads and compiles the model, and over stdio it also
accepts an optimization manifest. Readiness then goes to stderr. The stdio
loop processes one line at a time; the socket server serializes each
connection's requests on a promise chain and keeps its write side open
(`allowHalfOpen`) until every queued response has flushed.

The runtime layer one level down interprets each request payload.

A session over stdio, as the caller sees it:

```text
$ node dist/cli.js serve --model ./sir-model.json
Petrinaut stdio ready for model /work/sir-model.json   (stderr, path resolved)
{"id":1,"method":"healthz"}                            (stdin)
{"id":1,"result":{"ok":true}}                          (stdout)
```
