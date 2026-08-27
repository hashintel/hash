---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut-cli": patch
---

Optimization studies can carry boolean constraints — parameter-space expressions and metric-like state conditions — authored in the create-optimization drawer, lowered to serializable HIR, embedded in the manifest, exposed through the describe protocol, and evaluable from the Python binding (`petrinaut.Constraint`, value and signed margin). Declarative only: nothing enforces them yet.
