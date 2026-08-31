---
layer: cli
role: Runs one compiled Petrinaut model as a long-lived JSON-lines process for scripts and the optimizer service.
---

The CLI loads and compiles one model (or one optimization manifest) per
process, then answers one JSON request per line over stdio or a Unix socket.

Its consumers are out of band: the Python optimizer service
(`apps/petrinaut-opt`) and backend jobs spawn it as a subprocess and speak the
JSON-lines protocol, so the import graph shows no incoming edges to this
layer. That is a limit of import-derived edges, not a sign the package is
unused. The usage manual attached to the `cli` layer documents the transports,
the protocol, and optimization studies.
